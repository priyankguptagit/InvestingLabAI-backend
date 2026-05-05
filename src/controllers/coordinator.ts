import { Request, Response } from "express";
import { CoordinatorService } from "../services/coordinator";
import { asyncHandler } from "../common/errors/errorHandler";
import { z } from "zod";

const coordinatorService = new CoordinatorService();

const createCoordinatorSchema = z.object({
  departmentId: z.string(),
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  mobile: z.string().min(10, "Valid mobile number is required"),
  designation: z.enum(['hod', 'faculty', 'coordinator', 'other'])
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

const approveRejectSchema = z.object({
  reason: z.string().optional()
});

const addStudentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Valid email is required"),
  plan: z.enum(["Free", "Silver", "Gold", "Diamond"]).optional()
});

const importCSVSchema = z.object({
  students: z.array(
    z.object({
      name: z.string(),
      email: z.string(),
      organization: z.string().optional(),
      department: z.string().optional(),
      plan: z.string().optional()
    }).passthrough()
  )
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

const teacherReviewSchema = z.object({
  factor1Rating: z.number().int().min(1).max(5),
  factor2Rating: z.number().int().min(1).max(5),
  factor3Rating: z.number().int().min(1).max(5),
  suggestions: z.string().optional()
});

const updateCoordinatorProfileSchema = z.object({
  name: z.string().min(2).optional(),
  mobile: z.string().min(10).optional(),
  profilePhoto: z.string().optional().or(z.literal("")),
  bio: z.string().max(500).optional().or(z.literal("")),
});



export class CoordinatorController {

  // Create Coordinator (by Organization Admin)
  createCoordinator = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    const data = createCoordinatorSchema.parse(req.body);

    const result = await coordinatorService.createCoordinator({
      organizationId,
      ...data
    });

    res.status(201).json({ success: true, ...result });
  });

  // Verify Coordinator Email & Set Password
  verify = asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = verifySchema.parse(req.body);
    const result = await coordinatorService.verify(token, password);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({
      success: true,
      coordinator: result.coordinator
    });
  });

  // Login Coordinator
  login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password, rememberMe } = loginSchema.parse(req.body);
    const result = await coordinatorService.login(email, password, rememberMe);

    this.setAuthCookies(res, result.accessToken, result.refreshToken, rememberMe);
    res.status(200).json({
      success: true,
      coordinator: result.coordinator
    });
  });

  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, message: "No refresh token provided" });
      return;
    }

    try {
      const result = await coordinatorService.refreshToken(refreshToken);
      this.setAuthCookies(res, result.accessToken, result.refreshToken, result.rememberMe);
      res.status(200).json({ success: true, accessToken: result.accessToken });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message || "Invalid refresh token" });
    }
  });

  // Get Coordinator Profile
  getMe = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;

    const coordinator = await coordinatorService.getCoordinatorById(coordinatorId);
    res.status(200).json({ success: true, coordinator });
  });

  // Update Coordinator Profile
  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const updateData = updateCoordinatorProfileSchema.parse(req.body);

    const result = await coordinatorService.updateCoordinatorProfile(coordinatorId, updateData);
    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      ...result
    });
  });

  // Get Students in My Department
  getMyStudents = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const status = req.query.status as string | undefined;
    const plan = req.query.plan as string | undefined;
    const includePortfolio = req.query.includePortfolio === 'true';

    const students = await coordinatorService.getMyDepartmentStudents(coordinatorId, status, includePortfolio, plan);
    res.status(200).json({
      success: true,
      students,
      count: students.length
    });
  });

  // Get Pending Approvals
  getPendingStudents = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;

    const students = await coordinatorService.getPendingStudents(coordinatorId);
    res.status(200).json({
      success: true,
      students,
      count: students.length
    });
  });

  // Approve Student
  approveStudent = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const result = await coordinatorService.approveStudent(coordinatorId, studentId);
    res.status(200).json({ success: true, ...result });
  });

  // Reject Student
  rejectStudent = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const studentId = req.params.studentId as string;
    const { reason } = approveRejectSchema.parse(req.body);

    const result = await coordinatorService.rejectStudent(coordinatorId, studentId, reason);
    res.status(200).json({ success: true, ...result });
  });

  // Add Student Directly (No Approval Needed)
  addStudent = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const { name, email, plan } = addStudentSchema.parse(req.body);

    const result = await coordinatorService.addStudentDirectly(coordinatorId, { name, email, plan });
    res.status(201).json({ success: true, ...result });
  });

  // Import Students from CSV
  importStudentsCSV = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const { students } = importCSVSchema.parse(req.body);

    const result = await coordinatorService.importStudentsFromCSV(coordinatorId, students);
    res.status(200).json({ success: true, ...result });
  });

  // Get Student by ID (Department Restricted)
  getStudentById = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const student = await coordinatorService.getStudentById(coordinatorId, studentId);
    res.status(200).json({ success: true, student });
  });

  // Update Student (Department Restricted)
  updateStudent = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const studentId = req.params.studentId as string;
    const updateData = updateStudentSchema.parse(req.body);

    const result = await coordinatorService.updateStudent(coordinatorId, studentId, updateData);
    res.status(200).json({ success: true, ...result });
  });

  // Archive Student (Department Restricted)
  archiveStudent = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const result = await coordinatorService.archiveStudent(coordinatorId, studentId);
    res.status(200).json({ success: true, ...result });
  });

  // Unarchive Student (Department Restricted)
  unarchiveStudent = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const result = await coordinatorService.unarchiveStudent(coordinatorId, studentId);
    res.status(200).json({ success: true, ...result });
  });

  // Get Student Portfolio (Department Restricted)
  getStudentPortfolio = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const portfolio = await coordinatorService.getStudentPortfolio(coordinatorId, studentId);
    res.status(200).json({ success: true, portfolio });
  });


  // Bulk Action (Archive / Unarchive)
  bulkAction = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const { studentIds, action } = bulkActionSchema.parse(req.body);

    let result;
    if (action === 'archive') {
      result = await coordinatorService.bulkArchiveStudents(coordinatorId, studentIds);
    } else {
      result = await coordinatorService.bulkUnarchiveStudents(coordinatorId, studentIds);
    }

    res.status(200).json({ success: true, ...result });
  });

  // Reconcile Students — Generate AI Reports
  reconcileStudents = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const authToken = (req.headers.authorization as string) || req.cookies?.accessToken || '';

    const result = await coordinatorService.reconcileStudents(coordinatorId, authToken);
    res.status(200).json({ success: true, ...result });
  });

  // Get Student Report
  getStudentReport = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const { studentId } = req.params;

    const result = await coordinatorService.getStudentReport(coordinatorId, studentId as string);
    res.status(200).json({ success: true, ...result });
  });

  // Submit Teacher Review for a Student
  submitTeacherReview = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const { studentId } = req.params;
    const reviewData = teacherReviewSchema.parse(req.body);

    const result = await coordinatorService.submitTeacherReview(coordinatorId, studentId as string, reviewData);
    res.status(200).json({ success: true, ...result });
  });

  // Logout
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

  // Get All Coordinators (by Org Admin)
  getAllCoordinators = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;

    const coordinators = await coordinatorService.getCoordinatorsByOrganization(organizationId);
    res.status(200).json({
      success: true,
      coordinators,
      count: coordinators.length
    });
  });

  // Delete Coordinator (by Org Admin)
  deleteCoordinator = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    const coordinatorId = req.params.id as string;

    const result = await coordinatorService.deleteCoordinator(coordinatorId, organizationId);
    res.status(200).json({ success: true, ...result });
  });
  // Get Student Portfolio Metrics (for Accordion)
  getStudentPortfolioMetrics = asyncHandler(async (req: Request, res: Response) => {
    const coordinatorId = (req as any).user.id;
    const studentId = req.params.studentId as string;

    const metrics = await coordinatorService.getStudentPortfolioMetrics(coordinatorId, studentId);
    res.status(200).json({ success: true, metrics });
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
}
