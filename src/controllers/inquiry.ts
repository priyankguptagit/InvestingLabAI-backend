import { Request, Response } from 'express';
import { InquiryModel } from '../models/inquiry';

/**
 * createInquiry - Adds a new user inquiry to the database
 */
export const createInquiry = async (req: Request, res: Response) => {
  try {
    const { name, email, mobile, description, inquiryType } = req.body;

    // Simple validation
    if (!name || !email || !mobile || !description || !inquiryType) {
      return res.status(400).json({
        success: false,
        message: "All fields (name, email, mobile, description, inquiryType) are required."
      });
    }

    const newInquiry = new InquiryModel({
      name,
      email,
      mobile,
      description,
      inquiryType
    });

    await newInquiry.save();

    return res.status(201).json({
      success: true,
      message: "Your inquiry has been submitted successfully. We will get back to you soon.",
      data: newInquiry
    });
  } catch (error: any) {
    console.error("Error in createInquiry:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while submitting inquiry.",
      error: error.message
    });
  }
};

/**
 * getAllInquiries - Fetches all submitted inquiries (Admin only in production)
 */
export const getAllInquiries = async (req: Request, res: Response) => {
  try {
    const inquiries = await InquiryModel.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: inquiries.length,
      data: inquiries
    });
  } catch (error: any) {
    console.error("Error in getAllInquiries:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching inquiries."
    });
  }
};
