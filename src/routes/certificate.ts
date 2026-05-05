import express from 'express';
import { getMyCertificates } from '../controllers/certificateController';
import { authorize } from '../common/guards/role.guard';

const router = express.Router();

// Apply auth middleware for all routes
router.use(authorize(['user', 'admin', 'super_admin', 'organization_admin', 'department_coordinator']));

router.get('/my', getMyCertificates);

export default router;
