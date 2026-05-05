import { Request, Response } from "express";
import { OrganizationService } from "../services/organization";
import { asyncHandler } from "../common/errors/errorHandler";
import { z } from "zod";



const organizationService = new OrganizationService();

const updateProfileSchema = z.object({
  organizationName: z.string().optional(),
  organizationType: z.enum(['university', 'college', 'institute', 'school', 'other']).optional(),
  logoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
});

const registerSchema = z.object({
  organizationName: z.string().min(2, "Organization name is required"),
  organizationType: z.enum(['university', 'college', 'institute', 'school', 'other']),
  address: z.string().min(5, "Address is required"),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  pincode: z.string().min(5, "Pincode is required"),
  country: z.string().optional(),
  contactEmail: z.string().email("Valid email is required"),
  contactPhone: z.string().min(10, "Valid phone number is required"),
  website: z.string().url().optional().or(z.literal('')),
  registeredBy: z.object({
    name: z.string().min(2, "Name is required"),
    designation: z.string().min(2, "Designation is required")
  })
});

const verifySchema = z.object({
  token: z.string(),
  password: z.string().min(8, "Password must be at least 8 characters")
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  rememberMe: z.boolean().optional().default(false),
});

const createAdminSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  mobile: z.string().min(10, "Valid mobile number is required"),
  designation: z.enum(['dean', 'director', 'principal', 'admin', 'other'])
});

const approveRejectSchema = z.object({
  reason: z.string().optional()
});

const addStudentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Valid email is required"),
  departmentId: z.string().min(1, "Department is required"),
  plan: z.enum(["Free", "Silver", "Gold", "Diamond"]).optional()
});

const importCSVSchema = z.object({
  students: z.array(
    z.object({
      name: z.string(),
      email: z.string(),
      department: z.string(),
      plan: z.string().optional()
    }).passthrough()
  )
});

const submitTeacherReviewSchema = z.object({
  factor1Rating: z.number().min(1).max(5),
  factor2Rating: z.number().min(1).max(5),
  factor3Rating: z.number().min(1).max(5),
  suggestions: z.string().optional()
});

const updateStudentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  email: z.string().email("Valid email is required").optional(),
  plan: z.enum(["Free", "Silver", "Gold", "Diamond"]).optional()
});

const bulkActionSchema = z.object({
  studentIds: z.array(z.string()).min(1, "At least one student is required").max(100, "Maximum 100 students at a time"),
  action: z.enum(['archive', 'unarchive'])
});

const activateOrgSubscriptionSchema = z.object({
  subscriptionPlan: z.enum(['Silver', 'Gold', 'Diamond']),
  maxStudents: z.number().int().min(0).optional(),
  planAllocations: z.object({
    Silver: z.number().int().min(0).optional(),
    Gold: z.number().int().min(0).optional(),
    Diamond: z.number().int().min(0).optional(),
  }).optional(),
  planExpiryDates: z.object({
    Silver: z.string().datetime({ offset: true }).optional().or(z.literal('')),
    Gold: z.string().datetime({ offset: true }).optional().or(z.literal('')),
    Diamond: z.string().datetime({ offset: true }).optional().or(z.literal('')),
  }).optional()
});

// Schema for updating the Org Admin's PERSONAL profile (name + avatar)
// Completely separate from updateProfileSchema which updates the Organization entity
const updateAdminProfileSchema = z.object({
  name: z.string().min(2).optional(),
  avatar: z.string().url().optional().or(z.literal('')),
});

export class OrganizationController {

  register = asyncHandler(async (req: Request, res: Response) => {
    const data = registerSchema.parse(req.body);
    // Auto-derive registeredBy.email from contactEmail — single source of truth
    const enrichedData = {
      ...data,
      registeredBy: {
        ...data.registeredBy,
        email: data.contactEmail,
      },
    };
    const result = await organizationService.register(enrichedData);
    res.status(200).json({ success: true, ...result });
  });

  verify = asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = verifySchema.parse(req.body);
    const result = await organizationService.verify(token, password);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({
      success: true,
      organization: result.organization,
      admin: result.admin
    });
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password, rememberMe } = loginSchema.parse(req.body);
    const result = await organizationService.login(email, password, rememberMe);
    this.setAuthCookies(res, result.accessToken, result.refreshToken, rememberMe);
    res.status(200).json({
      success: true,
      organization: result.organization,
      admin: result.admin
    });
  });

  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, message: "No refresh token provided" });
      return;
    }

    try {
      const result = await organizationService.refreshToken(refreshToken);
      this.setAuthCookies(res, result.accessToken, result.refreshToken, result.rememberMe);
      res.status(200).json({ success: true, accessToken: result.accessToken });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message || "Invalid refresh token" });
    }
  });

  getMe = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;

    const result = await organizationService.getAdminById(adminId);
    res.status(200).json({ success: true, ...result });
  });

  // Create Additional Admin
  createAdmin = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    const data = createAdminSchema.parse(req.body);

    const result = await organizationService.createAdmin(organizationId, data);
    res.status(201).json({ success: true, ...result });
  });

  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    const updateData = updateProfileSchema.parse(req.body);

    const result = await organizationService.updateProfile(organizationId, updateData);
    res.status(200).json({
      success: true,
      message: "Organization profile updated successfully",
      ...result
    });
  });

  // Update the Org Admin's OWN personal profile (name + avatar)
  // This writes to OrganizationAdminModel — completely isolated from UserModel
  updateAdminProfile = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const updateData = updateAdminProfileSchema.parse(req.body);

    const result = await organizationService.updateAdminProfile(adminId, updateData);
    res.status(200).json({
      success: true,
      message: "Admin profile updated successfully",
      ...result
    });
  });

  // Get Organization Statistics
  getStats = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    const stats = await organizationService.getOrganizationStats(organizationId);

    res.status(200).json({ success: true, ...stats });
  });

  getPendingStudents = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;

    const students = await organizationService.getPendingStudents(organizationId);
    res.status(200).json({ success: true, students, count: students.length });
  });

  approveStudent = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const result = await organizationService.approveStudent(adminId, studentId);
    res.status(200).json({ success: true, ...result });
  });

  rejectStudent = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const studentId = req.params.studentId as string;
    const { reason } = approveRejectSchema.parse(req.body);

    const result = await organizationService.rejectStudent(adminId, studentId, reason);
    res.status(200).json({ success: true, ...result });
  });

  getStudents = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    const status = req.query.status as string | undefined;
    const departmentId = req.query.departmentId as string | undefined;
    const includePortfolio = req.query.includePortfolio === 'true';

    const students = await organizationService.getStudents(organizationId, {
      status,
      departmentId,
      includePortfolio
    });
    res.status(200).json({ success: true, students, count: students.length });
  });

  // Add Student Directly (No Approval Needed)
  addStudent = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const { name, email, departmentId, plan } = addStudentSchema.parse(req.body);

    const result = await organizationService.addStudentDirectly(adminId, { name, email, departmentId, plan });
    res.status(201).json({ success: true, ...result });
  });

  // Import Students from CSV
  importStudentsCSV = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const { students } = importCSVSchema.parse(req.body);

    const result = await organizationService.importStudentsFromCSV(adminId, students);
    res.status(200).json({ success: true, ...result });
  });

  // Get Student by ID
  getStudentById = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    const studentId = req.params.studentId as string;

    const student = await organizationService.getStudentById(organizationId, studentId);
    res.status(200).json({ success: true, student });
  });

  // Update Student
  updateStudent = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const studentId = req.params.studentId as string;
    const updateData = updateStudentSchema.parse(req.body);

    const result = await organizationService.updateStudent(adminId, studentId, updateData);
    res.status(200).json({ success: true, ...result });
  });

  // Archive Student (Soft Delete)
  archiveStudent = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const result = await organizationService.archiveStudent(adminId, studentId);
    res.status(200).json({ success: true, ...result });
  });

  // Unarchive Student
  unarchiveStudent = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const result = await organizationService.unarchiveStudent(adminId, studentId);
    res.status(200).json({ success: true, ...result });
  });

  // Get Student Portfolio
  getStudentPortfolio = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    const studentId = req.params.studentId as string;

    const portfolio = await organizationService.getStudentPortfolio(organizationId, studentId);
    res.status(200).json({ success: true, portfolio });
  });

  // Reconcile All Students (AI Reports)
  reconcileStudents = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const result = await organizationService.reconcileStudents(adminId);
    res.status(200).json({ success: true, ...result });
  });

  // Get AI Report for a Student
  getStudentReport = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const result = await organizationService.getStudentReport(adminId, studentId);
    res.status(200).json({ success: true, ...result });
  });

  // Submit Teacher Review
  submitTeacherReview = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const studentId = req.params.studentId as string;
    const reviewData = submitTeacherReviewSchema.parse(req.body);

    const result = await organizationService.submitTeacherReview(adminId, studentId, reviewData);
    res.status(200).json({ success: true, ...result });
  });
  bulkAction = asyncHandler(async (req: Request, res: Response) => {
    const adminId = (req as any).user.id;
    const { studentIds, action } = bulkActionSchema.parse(req.body);

    let result;
    if (action === 'archive') {
      result = await organizationService.bulkArchiveStudents(adminId, studentIds);
    } else {
      result = await organizationService.bulkUnarchiveStudents(adminId, studentIds);
    }

    res.status(200).json({ success: true, ...result });
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ("none" as const) : ("lax" as const)
    };

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);
    res.status(200).json({ success: true, message: "Logged out" });
  });

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string, rememberMe: boolean = false) {
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000
    });

    const refreshCookieOptions: any = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    };

    if (rememberMe) {
      refreshCookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);
  }

  // Admin endpoints to manage organizations (Platform Admin)
  getAllOrganizations = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string || '';

    const result = await organizationService.getAllOrganizations({ page, limit, search });
    res.status(200).json({ success: true, ...result });
  });

  toggleOrganizationActive = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.params.id as string;

    const organization = await organizationService.toggleOrganizationActive(organizationId);
    res.status(200).json({
      success: true,
      organization,
      message: `Organization ${organization.isActive ? 'activated' : 'deactivated'} successfully`
    });
  });

  // Public list for registration
  getPublicList = asyncHandler(async (req: Request, res: Response) => {
    const organizations = await organizationService.getPublicList();
    res.status(200).json({ success: true, organizations });
  });
  // ── Platform Admin: Activate Organization Subscription ──────────────────
  activateOrgSubscription = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.params.id as string;
    const data = activateOrgSubscriptionSchema.parse(req.body);

    // Build per-plan expiry dates map
    const planExpiryDates: { Silver?: Date; Gold?: Date; Diamond?: Date } = {};
    if (data.planExpiryDates?.Silver) planExpiryDates.Silver = new Date(data.planExpiryDates.Silver);
    if (data.planExpiryDates?.Gold) planExpiryDates.Gold = new Date(data.planExpiryDates.Gold);
    if (data.planExpiryDates?.Diamond) planExpiryDates.Diamond = new Date(data.planExpiryDates.Diamond);

    // Derive global subscriptionExpiry as the latest plan expiry (for backward-compat)
    const expiryValues = [planExpiryDates.Silver, planExpiryDates.Gold, planExpiryDates.Diamond]
      .filter((d): d is Date => !!d);
    const subscriptionExpiry = expiryValues.length > 0
      ? new Date(Math.max(...expiryValues.map(d => d.getTime())))
      : (() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d; })();

    const result = await organizationService.activateOrgSubscription(organizationId, {
      subscriptionPlan: data.subscriptionPlan as 'Silver' | 'Gold' | 'Diamond',
      subscriptionExpiry,
      maxStudents: data.maxStudents,
      planAllocations: data.planAllocations,
      planExpiryDates
    });
    res.status(200).json({ success: true, ...result });
  });

  // ── Platform Admin: Deactivate Organization Subscription ─────────────────
  deactivateOrgSubscription = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.params.id as string;

    const result = await organizationService.deactivateOrgSubscription(organizationId);
    res.status(200).json({ success: true, ...result });
  });
}
