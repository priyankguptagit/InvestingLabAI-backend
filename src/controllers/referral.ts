import { Request, Response } from 'express';
import { ReferralCodeModel } from '../models/referralCode';
import { CommissionLogModel } from '../models/commissionLog';
import { CompanyMemberModel } from '../models/company';
import { generateUniqueReferralCode } from '../utils/referralGenerator';

/**
 * TOGGLE CODE STATUS
 * Route: PATCH /api/referrals/:codeId/toggle-status
 * Auth: Requires CompanyMember session
 */
export const toggleCodeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { codeId } = req.params;
    const employeeId = req.user?.id;
    const role = req.user?.role;

    if (!employeeId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const referral = await ReferralCodeModel.findById(codeId);

    if (!referral) {
      return res.status(404).json({ success: false, message: 'Referral code not found' });
    }

    // Only allow super_admin, admin, or the code creator to toggle
    if (role !== 'super_admin' && role !== 'admin' && referral.employeeId.toString() !== employeeId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this code' });
    }

    referral.isActive = !referral.isActive;
    await referral.save();

    return res.status(200).json({
      success: true,
      message: `Referral code ${referral.isActive ? 'activated' : 'disabled'} successfully`,
      data: referral
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Reusable interface for typed requests if needed
interface AuthRequest extends Request {
  user?: any;
}

/**
 * VALIDATE REFERRAL CODE 
 * Route: POST /api/referrals/validate
 * Body: { code: 'AMAN10-X7B' }
 * Public endpoint for users during checkout
 */
export const validateCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Referral code is required' });
    }

    const referral = await ReferralCodeModel.findOne({ code: code.toUpperCase() });

    if (!referral) {
      return res.status(404).json({ success: false, message: 'Invalid referral code' });
    }

    if (!referral.isActive) {
      return res.status(400).json({ success: false, message: 'This referral code is no longer active' });
    }

    return res.status(200).json({
      success: true,
      discountPercent: referral.discountPercent,
      message: `${referral.discountPercent}% discount applied successfully!`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GENERATE REFERRAL CODE
 * Route: POST /api/referrals/generate
 * Body: { discountPercent: 10 }
 * Auth: Requires CompanyMember session
 */
export const generateCode = async (req: AuthRequest, res: Response) => {
  try {
    const { discountPercent } = req.body;
    
    // In our Praedico system, CompanyMembers authenticate.
    // For now, if req.user is a User it might not work. We assume the route
    // will be protected by an admin/employee middleware.
    // Ensure the requester is an employee or super_admin.
    const employeeId = req.user?.id; // Assumes your middleware sets req.user.id
    
    if (!employeeId) {
       return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Verify it's an employee, admin, or super_admin
    const employee = await CompanyMemberModel.findById(employeeId);
    if (!employee) {
       return res.status(403).json({ success: false, message: 'Only internal staff can generate referral codes' });
    }

    if (discountPercent === undefined || discountPercent < 0 || discountPercent > 20) {
      return res.status(400).json({ success: false, message: 'Discount percent must be between 0 and 20' });
    }

    const referralCode = await generateUniqueReferralCode(employeeId, Number(discountPercent));

    return res.status(201).json({
      success: true,
      data: referralCode,
      message: 'Referral code generated successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET EMPLOYEE CODES
 * Route: GET /api/referrals/my-codes
 * Auth: Requires CompanyMember session
 */
export const getMyCodes = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = req.user?.id;

    if (!employeeId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const codes = await ReferralCodeModel.find({ employeeId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: codes
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET ALL CODES
 * Route: GET /api/referrals/all-codes
 * Auth: Requires CompanyMember session with admin or super_admin role
 */
export const getAllCodes = async (req: AuthRequest, res: Response) => {
  try {
    const codes = await ReferralCodeModel.find({})
      .populate('employeeId', 'name email role')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: codes
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET EMPLOYEE HISTORY
 * Route: GET /api/referrals/history
 * Auth: Requires CompanyMember session
 */
export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = req.user?.id;

    if (!employeeId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const logs = await CommissionLogModel.find({ employeeId })
      .populate('userId', 'name email avatar')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET ALL HISTORY
 * Route: GET /api/referrals/all-history
 * Auth: Requires CompanyMember session with admin or super_admin role
 */
export const getAllHistory = async (req: AuthRequest, res: Response) => {
  try {
    const logs = await CommissionLogModel.find({})
      .populate('userId', 'name email avatar')
      .populate('employeeId', 'name email role')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET EMPLOYEE PERFORMANCE
 * Route: GET /api/referrals/performance/:employeeId
 * Auth: Requires CompanyMember session with admin or super_admin role
 */
export const getEmployeePerformance = async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const codes = await ReferralCodeModel.find({ employeeId }).sort({ createdAt: -1 });

    const logs = await CommissionLogModel.find({ employeeId })
      .populate('userId', 'name email avatar')
      .sort({ createdAt: -1 });

    let totalRevenue = 0;
    let totalProfit = 0;
    let totalDiscountProvided = 0;

    logs.forEach(log => {
      totalRevenue += log.amountPaid;
      totalProfit += (log.amountPaid - log.commissionEarned);
      totalDiscountProvided += log.discountGiven;
    });

    return res.status(200).json({
      success: true,
      data: {
        codes,
        logs,
        stats: {
          totalRevenue,
          totalProfit,
          totalDiscountProvided,
          totalReferrals: logs.length
        }
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
