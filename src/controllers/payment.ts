import { Request, Response } from 'express';
import { PaymentService } from '../services/payment';
import { ENV } from '../config/env';
import { UserModel } from '../models/user';
import { ReferralCodeModel } from '../models/referralCode';
import { CommissionLogModel } from '../models/commissionLog';
import { PaymentRecordModel } from '../models/paymentRecord';
import { PLAN_PRICES_PAISE, PlanName, Duration } from '../config/pricing.config';
import { getPlanLimits } from '../config/plans';
import { sendPaymentConfirmationEmail } from '../services/email';
import crypto from 'crypto';

interface AuthRequest extends Request {
  user?: any;
}

/**
 * CREATE ORDER  (One-Time Payment)
 * Route: POST /api/payments/create-order
 * Body: { planName: 'Silver'|'Gold'|'Diamond', duration: 1|3|6, referralCode?: string }
 *
 * Flow:
 *  1. Look up the server-side price (client can NEVER send the amount).
 *  2. Apply referral discount if code is valid.
 *  3. Create Razorpay order.
 *  4. Write a PaymentRecord(status:'created') immediately — this anchors the order
 *     so the webhook can activate the user even if /verify never fires.
 */
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { planName, duration, referralCode } = req.body as {
      planName: PlanName;
      duration: Duration;
      referralCode?: string;
    };
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    if (!planName || !duration) {
      return res.status(400).json({ success: false, message: 'planName and duration are required' });
    }

    let amountPaise = PLAN_PRICES_PAISE[planName]?.[duration];
    if (!amountPaise) {
      return res.status(400).json({ success: false, message: 'Invalid plan or duration' });
    }

    let discountPaise = 0;
    let validatedReferralCode: string | undefined;

    // ── Referral Discount ─────────────────────────────────────────
    if (referralCode) {
      const referral = await ReferralCodeModel.findOne({
        code: referralCode.toUpperCase(),
        isActive: true,
      });
      if (!referral) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid or inactive referral code' });
      }
      discountPaise = Math.floor((amountPaise * referral.discountPercent) / 100);
      amountPaise -= discountPaise;
      validatedReferralCode = referral.code;
    }

    // ── Create Razorpay Order ─────────────────────────────────────
    // Razorpay receipt limit: 40 characters max.
    // Format: rcpt_<plan3>_<dur>_<uid8>_<ts8> → always ≤ 27 chars
    const planShort = planName.slice(0, 3).toLowerCase(); // sil/gol/dia
    const uid8      = userId.toString().slice(-8);
    const ts8       = Date.now().toString(36).slice(-8);  // base-36, 8 chars
    const receipt   = `rcpt_${planShort}_${duration}_${uid8}_${ts8}`;
    const order = await PaymentService.createOrder(amountPaise, receipt);

    // ── Write PaymentRecord (status: 'created') ───────────────────
    // This is the idempotency anchor. If the browser crashes after payment
    // but before /verify fires, the webhook will find this record and activate.
    await PaymentRecordModel.create({
      userId,
      razorpayOrderId: order.id,
      planName,
      duration,
      amountPaise,
      currency: 'INR',
      status: 'created',
      referralCode: validatedReferralCode,
      discountPaise: discountPaise > 0 ? discountPaise : undefined,
      webhookEvents: [],
    });

    return res.status(200).json({
      success: true,
      orderId: order.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: ENV.razorpay.keyId,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * VERIFY ORDER PAYMENT
 * Route: POST /api/payments/verify
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, planName, duration }
 *
 * Idempotency contract:
 *  - If PaymentRecord.status === 'paid' → already processed, return 200 immediately.
 *  - If PaymentRecord.status === 'created' → verify HMAC, activate, mark paid, send email.
 *  - If PaymentRecord not found → reject (unknown order — not created by us).
 */
export const verifyOrder = async (req: AuthRequest, res: Response) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planName,
      duration,
      referralCode,
    } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // ── Idempotency Check ─────────────────────────────────────────
    const paymentRecord = await PaymentRecordModel.findOne({
      razorpayOrderId: razorpay_order_id,
    });

    if (!paymentRecord) {
      // Order was never created by our system
      return res.status(400).json({ success: false, message: 'Unknown order. Contact support.' });
    }

    if (paymentRecord.status === 'paid') {
      // Already processed — idempotent 200 response, no side effects
      return res
        .status(200)
        .json({ success: true, message: 'Payment already verified and subscription active.' });
    }

    // ── HMAC Signature Verification ───────────────────────────────
    const isValid = PaymentService.verifyOrderSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // ── Activate Subscription ─────────────────────────────────────
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + Number(duration));

    // Grant the plan's initial virtual balance
    const planLimits = getPlanLimits(planName);
    const initialBalance = planLimits.initialVirtualBalance;

    await UserModel.findByIdAndUpdate(userId, {
      subscriptionId: razorpay_payment_id,   // store the PAYMENT ID (semantically correct)
      subscriptionStatus: 'active',
      currentPlan: planName || 'Silver',
      subscriptionExpiry: expiryDate,
      isOnTrial: false,
      // Credit the plan's starting virtual balance (source of truth: src/config/plans.ts)
      virtualBalance: initialBalance,
      initialVirtualBalance: initialBalance,
      virtualBalanceLastReset: new Date(),
    });

    // ── Mark PaymentRecord as Paid ────────────────────────────────
    paymentRecord.razorpayPaymentId = razorpay_payment_id;
    paymentRecord.status = 'paid';
    paymentRecord.activatedAt = new Date();
    paymentRecord.expiresAt = expiryDate;
    paymentRecord.webhookEvents.push('verify');
    await paymentRecord.save();

    // ── Referral Commission ───────────────────────────────────────
    if (referralCode && planName && duration) {
      const referral = await ReferralCodeModel.findOne({
        code: referralCode.toUpperCase(),
        isActive: true,
      });
      if (referral) {
        const originalPricePaise =
          PLAN_PRICES_PAISE[planName as PlanName]?.[duration as Duration] || 0;
        const discountAmountPaise = Math.floor(
          (originalPricePaise * referral.discountPercent) / 100
        );
        const amountPaidPaise = originalPricePaise - discountAmountPaise;
        const commissionEarnedPaise = Math.floor(
          (amountPaidPaise * referral.commissionPercent) / 100
        );

        await CommissionLogModel.create({
          employeeId: referral.employeeId,
          userId,
          referralCode: referral.code,
          planName: `${planName} (${duration} mo)`,
          originalPrice: originalPricePaise / 100,
          discountGiven: discountAmountPaise / 100,
          amountPaid: amountPaidPaise / 100,
          commissionEarned: commissionEarnedPaise / 100,
          status: 'pending',
        });

        referral.usageCount += 1;
        await referral.save();
      }
    }

    // ── Payment Confirmation Email ─────────────────────────────────
    try {
      const user = await UserModel.findById(userId).select('name email');
      if (user) {
        await sendPaymentConfirmationEmail({
          to: user.email,
          name: user.name,
          planName,
          duration: Number(duration),
          amountPaise: paymentRecord.amountPaise,
          razorpayPaymentId: razorpay_payment_id,
          expiresAt: expiryDate,
        });
      }
    } catch (emailErr) {
      // Never fail the response due to an email error — log and move on
      console.error('[verifyOrder] Confirmation email failed:', emailErr);
    }

    return res
      .status(200)
      .json({ success: true, message: 'Payment verified & subscription activated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * INIT TRIAL SUBSCRIPTION (7 Days free — no Razorpay charge)
 * Route: POST /api/payments/trial
 * Body: { planName: 'Silver'|'Gold'|'Diamond' }
 */
export const initiateTrial = async (req: AuthRequest, res: Response) => {
  try {
    const { planName } = req.body as { planName: PlanName };
    const userId = req.user?.id;

    if (!planName) {
      return res.status(400).json({ success: false, message: 'planName is required' });
    }

    const VALID_PLANS: PlanName[] = ['Silver', 'Gold', 'Diamond'];
    if (!VALID_PLANS.includes(planName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}`,
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.hasUsedTrial) {
      return res
        .status(403)
        .json({ success: false, message: 'You have already used your free trial.' });
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);

    // Grant the plan's initial virtual balance for trial too
    const planLimits = getPlanLimits(planName);
    const initialBalance = planLimits.initialVirtualBalance;

    await UserModel.findByIdAndUpdate(userId, {
      subscriptionStatus: 'active',
      currentPlan: planName,
      subscriptionExpiry: expiryDate,
      isOnTrial: true,
      hasUsedTrial: true,
      trialEndDate: expiryDate,
      // Credit the plan's starting virtual balance (source of truth: src/config/plans.ts)
      virtualBalance: initialBalance,
      initialVirtualBalance: initialBalance,
      virtualBalanceLastReset: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: 'Trial activated! Enjoy 7 days of premium access.',
      isTrial: true,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * WEBHOOK HANDLER
 * Route: POST /api/payments/webhook
 *
 * Acts as a reliable fallback for payments where the user's browser crashed
 * or the network dropped before /verify could be called.
 *
 * Events handled:
 *   payment.captured → activate subscription if /verify hadn't done so yet
 *   payment.failed   → mark PaymentRecord as failed
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const secret = ENV.razorpay.webhookSecret;
    const signature = req.headers['x-razorpay-signature'] as string;

    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing signature header' });
    }

    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body;
    const eventType: string = event.event;
    console.log(`[WEBHOOK] Received event: ${eventType}`);

    // ── payment.captured ────────────────────────────────────────────
    if (eventType === 'payment.captured') {
      const paymentEntity = event.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (orderId) {
        const record = await PaymentRecordModel.findOne({ razorpayOrderId: orderId });

        if (!record) {
          // Order not found — log for investigation, still return 200
          console.warn(`[WEBHOOK] payment.captured: No PaymentRecord for orderId ${orderId}`);
        } else {
          // Append this event to the trace log regardless of current status
          record.webhookEvents.push(eventType);

          if (record.status !== 'paid') {
            // /verify never fired — activate the user now as a reliable fallback
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + record.duration);

            // Grant the plan's initial virtual balance
            const planLimits = getPlanLimits(record.planName);
            const initialBalance = planLimits.initialVirtualBalance;

            await UserModel.findByIdAndUpdate(record.userId, {
              subscriptionId: paymentId,
              subscriptionStatus: 'active',
              currentPlan: record.planName,
              subscriptionExpiry: expiryDate,
              isOnTrial: false,
              // Credit the plan's starting virtual balance (source of truth: src/config/plans.ts)
              virtualBalance: initialBalance,
              initialVirtualBalance: initialBalance,
              virtualBalanceLastReset: new Date(),
            });

            record.razorpayPaymentId = paymentId;
            record.status = 'paid';
            record.activatedAt = new Date();
            record.expiresAt = expiryDate;

            // Send confirmation email via webhook fallback path
            try {
              const user = await UserModel.findById(record.userId).select('name email');
              if (user) {
                await sendPaymentConfirmationEmail({
                  to: user.email,
                  name: user.name,
                  planName: record.planName,
                  duration: record.duration,
                  amountPaise: record.amountPaise,
                  razorpayPaymentId: paymentId,
                  expiresAt: expiryDate,
                });
              }
            } catch (emailErr) {
              console.error('[WEBHOOK] Confirmation email failed:', emailErr);
            }

            console.log(`[WEBHOOK] ✓ Fallback activation for order ${orderId} → user ${record.userId}`);
          } else {
            console.log(`[WEBHOOK] ✓ payment.captured — already activated via /verify for order ${orderId}`);
          }

          await record.save();
        }
      }
    }

    // ── payment.failed ──────────────────────────────────────────────
    else if (eventType === 'payment.failed') {
      const orderId = event.payload?.payment?.entity?.order_id;
      if (orderId) {
        await PaymentRecordModel.findOneAndUpdate(
          { razorpayOrderId: orderId, status: 'created' },
          {
            $set: { status: 'failed' },
            $push: { webhookEvents: eventType },
          }
        );
        console.log(`[WEBHOOK] ✓ Marked PaymentRecord as failed for order ${orderId}`);
      }
    }

    // ── unhandled events ────────────────────────────────────────────
    else {
      console.log(`[WEBHOOK] Unhandled event: ${eventType}`);
    }

    return res.status(200).json({ success: true, event: eventType });
  } catch (error: any) {
    console.error('[WEBHOOK] Error:', error.message);
    // Always return 200 to Razorpay — a non-200 causes retries
    return res.status(200).json({ success: false, error: 'Internal processing error' });
  }
};

/**
 * GET PAYMENT HISTORY (Admin)
 * Route: GET /api/payments/history?page=1&limit=20
 */
export const getPaymentHistory = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      PaymentRecordModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email')
        .lean(),
      PaymentRecordModel.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: records,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET PAYMENT HISTORY FOR A SPECIFIC USER (Admin)
 * Route: GET /api/payments/history/:userId
 */
export const getUserPaymentHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const records = await PaymentRecordModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
/**
 * GET MY PAYMENT HISTORY (Authenticated User)
 * Route: GET /api/payments/my-history
 */
export const getMyPaymentHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const records = await PaymentRecordModel.find({ userId, status: 'paid' })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
