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

/**
 * Public: Validate a certificate by code and user name
 * POST /api/certificates/validate
 */
export const validateCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { certificateCode, userName } = req.body;

    if (!certificateCode || !userName) {
      res.status(400).json({ success: false, message: 'Certificate code and user name are required' });
      return;
    }

    // Prepare search variations (as-is, PRD-, PGR-)
    const cleanCode = certificateCode.replace(/^(PRD-|PGR-)/i, '');
    const searchCodes = [
      certificateCode,
      `PRD-${cleanCode}`,
      `PGR-${cleanCode}`,
      cleanCode
    ];

    // Find certificate and populate user to check name
    const certificate = await CertificateModel.findOne({
      certificateNumber: { $in: searchCodes.map(c => c.trim()) }
    }).populate('user', 'name');

    if (!certificate) {
      res.status(404).json({ success: false, message: 'Invalid certificate code' });
      return;
    }

    const registeredUser = certificate.user as any;
    
    // Case-insensitive name matching
    if (!registeredUser || registeredUser.name.toLowerCase() !== userName.toLowerCase().trim()) {
      res.status(400).json({ success: false, message: 'Certificate code found, but user name does not match' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Certificate validated successfully',
      data: {
        certificateNumber: certificate.certificateNumber,
        planName: certificate.planName,
        issuedAt: certificate.issuedAt,
        startDate: certificate.startDate,
        endDate: certificate.endDate,
        userName: registeredUser.name,
        type: certificate.type
      }
    });
  } catch (error) {
    next(error);
  }
};
