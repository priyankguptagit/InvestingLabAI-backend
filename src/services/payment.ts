import crypto from 'crypto';
import { razorpayInstance } from '../config/razorpay';
import { ENV } from '../config/env';

/**
 * PaymentService — all payments on this platform are ONE-TIME (no autopay / recurring).
 * There is no subscription creation flow; every purchase is a standard Razorpay Order.
 */
export class PaymentService {
  /**
   * Creates a one-time Razorpay Order for a specific amount.
   * @param amountPaise - Amount in paise (₹1 = 100 paise)
   * @param receipt     - Unique receipt string (e.g. `rcpt_Silver_1mo_userId_timestamp`)
   */
  static async createOrder(amountPaise: number, receipt: string) {
    try {
      const order = await razorpayInstance.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
      });
      return order;
    } catch (error) {
      console.error('[PaymentService] Error creating order:', error);
      throw new Error('Failed to create Razorpay order');
    }
  }

  /**
   * Verifies the HMAC-SHA256 payment signature for a ONE-TIME ORDER.
   * Razorpay signs: orderId + "|" + paymentId
   */
  static verifyOrderSignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): boolean {
    const data = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', ENV.razorpay.keySecret)
      .update(data)
      .digest('hex');
    return expectedSignature === signature;
  }
}