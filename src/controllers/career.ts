import { Request, Response } from 'express';
import { CareerModel } from '../models/career';
import cloudinary from "../config/cloudinary";
import * as https from 'https';
import * as http from 'http';

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

export const submitApplication = async (req: Request, res: Response) => {
  try {
    const { fullName, email, mobile, inquiryType, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Resume is required (PDF only)' });
    }

    // 1. Upload Resume to Cloudinary
    const { secure_url } = await streamToCloudinary(req.file.buffer, {
      folder: 'resumes',
      allowed_formats: ['pdf'],
      resource_type: 'raw'   // 'raw' is correct for PDFs — avoids image-pipeline issues
    });

    // 2. Save to Database
    const newApplication = new CareerModel({
      fullName,
      email,
      mobile,
      inquiryType,
      description,
      resumeUrl: secure_url,
      status: 'Pending'
    });

    await newApplication.save();

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully!',
      data: newApplication
    });

  } catch (error: any) {
    console.error('Career Submission Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit application',
      error: error.message
    });
  }
};

export const getAllApplications = async (req: Request, res: Response) => {
  try {
    const applications = await CareerModel.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: applications
    });
  } catch (error: any) {
    console.error('Fetch Applications Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch applications',
      error: error.message
    });
  }
};

export const updateApplicationStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const application = await CareerModel.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      data: application
    });
  } catch (error: any) {
    console.error('Update Application Status Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update application status',
      error: error.message
    });
  }
};

/**
 * GET /api/careers/:id/download-resume
 * Proxies the candidate's resume PDF from Cloudinary back to the client
 * with proper Content-Disposition: attachment headers so the browser
 * downloads the file instead of opening it inline.
 */
export const downloadResume = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const application = await CareerModel.findById(id).select('fullName resumeUrl');
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const { resumeUrl, fullName } = application;
    const safeFileName = `${(fullName as string).replace(/[^a-z0-9]/gi, '_')}_Resume.pdf`;

    // Choose the right transport module based on URL protocol
    const transport = resumeUrl.startsWith('https') ? https : http;

    const proxyRequest = transport.get(resumeUrl, (cloudinaryRes) => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);

      if (cloudinaryRes.headers['content-length']) {
        res.setHeader('Content-Length', cloudinaryRes.headers['content-length']);
      }

      cloudinaryRes.pipe(res);
    });

    proxyRequest.on('error', (err) => {
      console.error('Resume proxy error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to stream resume' });
      }
    });

  } catch (error: any) {
    console.error('Download Resume Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to download resume',
      error: error.message
    });
  }
};
