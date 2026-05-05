import { Router } from 'express';
import {
  createOrder,
  verifyOrder,
  initiateTrial,
  handleWebhook,
  getPaymentHistory,
  getUserPaymentHistory,
  getMyPaymentHistory,
} from '../controllers/payment';
import { authorize } from '../common/guards/role.guard';

const router = Router();

// ── User-facing routes (protected) ───────────────────────────────────────────

// Create a one-time Razorpay order and anchor a PaymentRecord
router.post('/create-order', authorize(['user', 'admin', 'super_admin']), createOrder);

// Verify payment after Razorpay checkout closes (idempotent)
router.post('/verify', authorize(['user', 'admin', 'super_admin']), verifyOrder);

// Activate 7-day free trial (once per lifetime, no Razorpay charge)
router.post('/trial', authorize(['user', 'admin', 'super_admin']), initiateTrial);

// ── Razorpay webhook (public, secured by HMAC signature) ─────────────────────
router.post('/webhook', handleWebhook);

// ── Admin payment ledger routes ───────────────────────────────────────────────

// All payments, newest first (paginated)
router.get('/history', authorize(['admin', 'super_admin']), getPaymentHistory);

// Payment history for a specific user
router.get('/history/:userId', authorize(['admin', 'super_admin']), getUserPaymentHistory);

// User's own payment history (for invoice download on user portal)
router.get('/my-history', authorize(['user', 'admin', 'super_admin']), getMyPaymentHistory);

export default router;