import { Request, Response } from 'express';
import cloudinary from "../config/cloudinary";

/**
 * Pipes a buffer from multer's memoryStorage into Cloudinary v2 via upload_stream.
 */
const streamToCloudinary = (
  buffer: Buffer,
  options: object
): Promise<{ secure_url: string; public_id: string }> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) {
        return reject(error ?? new Error('Cloudinary upload returned no result'));
      }
      resolve({ secure_url: result.secure_url, public_id: result.public_id });
    });
    stream.end(buffer);
  });
};

// POST /api/upload
export const uploadFileToCloudinary = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const folder = (req.query.folder as string) || 'praedico_gallery';
    const { secure_url, public_id } = await streamToCloudinary(req.file.buffer, {
      folder,
      allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
      transformation: [{ width: 1200, crop: 'limit' }],
    });

    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      url: secure_url,
      filename: public_id,
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message,
    });
  }
};
