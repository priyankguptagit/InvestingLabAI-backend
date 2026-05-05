import express from 'express';
import multer from 'multer';
import { uploadFileToCloudinary } from '../controllers/upload.controller';

const router = express.Router();

// Use memory storage — file lands in req.file.buffer, no disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.') as any);
    }
  },
});

// Upload endpoint
router.post('/', upload.single('image'), uploadFileToCloudinary);

export default router;
