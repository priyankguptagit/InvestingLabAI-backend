import express from 'express';
import multer from 'multer';
import { submitApplication, getAllApplications, updateApplicationStatus, downloadResume } from '../controllers/career';
import { authorize } from '../common/guards/role.guard';
import { validateAdminSession } from '../common/middlewares/session.middleware';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for resumes
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!') as any);
    }
  },
});

// POST /api/careers/submit
router.post('/submit', upload.single('resume'), submitApplication);

// GET /api/careers
router.get('/', authorize(['super_admin', 'admin', 'employee']), validateAdminSession, getAllApplications);

// PUT /api/careers/:id/status
router.put('/:id/status', authorize(['super_admin', 'admin', 'employee']), validateAdminSession, updateApplicationStatus);

// GET /api/careers/:id/download-resume
router.get('/:id/download-resume', authorize(['super_admin', 'admin', 'employee']), validateAdminSession, downloadResume);

export default router;
