import { Router } from 'express';
import { FeedbackController } from '../controllers/feedback';
import { validateSession } from '../common/middlewares/session.middleware';
import { authorize } from '../common/guards/role.guard';
import rateLimit from 'express-rate-limit';

const router = Router();
const feedbackController = new FeedbackController();

// Rate limiting for feedback submissions (Max 10 per 15 mins — multi-step wizard may retry)
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many feedback submissions. Please try again later."
  }
});

// ==== PUBLIC ROUTES ====
router.get('/public/testimonials', feedbackController.getPublicTestimonials);

// ==== PROTECTED SUBMISSION ROUTES ====
router.post('/submit', validateSession, authorize(['user', 'admin', 'super_admin', 'organization_admin', 'department_coordinator']), submitLimiter, feedbackController.submitFeedback);

// ==== SELF-SERVICE: VIEW & EDIT OWN FEEDBACK ====
router.get('/my', validateSession, authorize(['user', 'admin', 'super_admin', 'organization_admin', 'department_coordinator']), feedbackController.getMyFeedbacks);
router.put('/my/:id', validateSession, authorize(['user', 'admin', 'super_admin', 'organization_admin', 'department_coordinator']), feedbackController.updateMyFeedback);

// ==== ADMIN ROUTES ====
router.get('/admin/all', validateSession, authorize(['admin', 'super_admin', 'employee'], ['feedback.view']), feedbackController.getAdminFeedbacks);
router.patch('/admin/:id/status', validateSession, authorize(['admin', 'super_admin', 'employee'], ['feedback.update_status']), feedbackController.updateFeedbackStatus);
router.delete('/admin/:id', validateSession, authorize(['admin', 'super_admin', 'employee'], ['feedback.delete']), feedbackController.deleteFeedback);

export default router;
