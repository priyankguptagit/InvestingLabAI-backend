import express from 'express';
import { getMyCertificates, validateCertificate } from '../controllers/certificateController';
import { authorize } from '../common/guards/role.guard';

const router = express.Router();

// Public route - MUST be before the authorize middleware
router.post('/validate', validateCertificate);

// Apply auth middleware for all private routes
router.use(authorize(['user', 'admin', 'super_admin', 'organization_admin', 'department_coordinator']));

router.get('/my', getMyCertificates);

export default router;
