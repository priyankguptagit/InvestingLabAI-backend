import { Router } from 'express';
import { createInquiry, getAllInquiries } from '../controllers/inquiry';

/**
 * router - Inquiry routes
 * Path: /api/inquiries
 */
const router = Router();

// POST /create - Submit a new inquiry
router.post('/create', createInquiry);

// GET / - Retrieve all inquiries (Admin)
router.get('/', getAllInquiries);

export default router;
