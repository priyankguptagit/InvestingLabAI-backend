import { Request, Response, NextFunction } from 'express';
import { CertificateModel } from '../models/certificate';

export const getMyCertificates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const certificates = await CertificateModel.find({ user: userId }).sort({ issuedAt: -1 });

    res.status(200).json({
      success: true,
      data: certificates
    });
  } catch (error) {
    next(error);
  }
};
