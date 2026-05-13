import { OrganizationModel, IOrganization } from "../models/organization";
import { OrganizationAdminModel } from "../models/organizationAdmin";
import { DepartmentModel } from "../models/department";
import { DepartmentCoordinatorModel } from "../models/departmentCoordinator";
import { UserModel } from "../models/user";
import PortfolioHolding from "../models/portfolio";
import { PaperTradeModel } from "../models/paperTrade";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ENV } from "../config/env";
import {
  sendOrganizationVerificationEmail,
  sendStudentApprovalNotificationToOrganization,
  sendStudentApprovalEmail,
  sendStudentRejectionEmail,
  sendOrganizationAdminInviteEmail
} from "./email";
import aiChatbotService from "./aiChatbot";
import {
  buildStudentPlanFields,
  extractStudentPlanFromCsvRow,
  normalizeStudentPlan,
  StudentPlan,
} from "../utils/studentPlan";
import { getEffectivePlan } from "../utils/getEffectivePlan";
export class OrganizationService {

  // Register Organization (Initial Registration)
  async register(data: {
    organizationName: string;
    organizationType: 'university' | 'college' | 'institute' | 'school' | 'other';
    address: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
    contactEmail: string;
    contactPhone: string;
    website?: string;
    registeredBy: {
      name: string;
      email: string;
      designation: string;
    };
  }) {
    const existingOrg = await OrganizationModel.findOne({ contactEmail: data.contactEmail });
    if (existingOrg) {
      throw new Error("Organization with this email already exists");
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");

    const organization = await OrganizationModel.create({
      ...data,
      country: data.country || 'India',
      verificationToken,
      isVerified: false,
      totalAdmins: 1
    });

    await sendOrganizationVerificationEmail(
      data.registeredBy.email,
      verificationToken,
      data.organizationName,
      data.registeredBy.name
    );

    return {
      message: "Organization registered! Please check email to verify account.",
      organizationId: organization._id
    };
  }

  // Verify Organization & Set Password (Creates first admin)
  async verify(token: string, password: string) {
    const organization = await OrganizationModel.findOne({ verificationToken: token })
      .select("+verificationToken");

    if (!organization) {
      throw new Error("Invalid or expired verification token");
    }

    const hashedPassword = await argon2.hash(password);

    // Normalize designation to lowercase to match enum — handles legacy registrations
    // where the designation was stored with mixed case (e.g. "Dean" instead of "dean")
    const rawDesignation = organization.registeredBy.designation || 'other';
    const normalizedDesignation = rawDesignation.toLowerCase();
    const validDesignations = ['dean', 'director', 'principal', 'admin', 'other'];
    const designation = validDesignations.includes(normalizedDesignation)
      ? normalizedDesignation as 'dean' | 'director' | 'principal' | 'admin' | 'other'
      : 'other';

    // Idempotent admin creation: if a previous verify attempt partially succeeded
    // and left an admin record, reuse it rather than failing with a duplicate key error.
    let orgAdmin = await OrganizationAdminModel.findOne({
      email: organization.registeredBy.email
    });

    if (!orgAdmin) {
      // Create Organization Admin
      orgAdmin = await OrganizationAdminModel.create({
        organization: organization._id,
        name: organization.registeredBy.name,
        email: organization.registeredBy.email,
        mobile: organization.contactPhone,
        designation,
        passwordHash: hashedPassword,
        isVerified: true,
        isActive: true
      });
    } else {
      // Admin already exists from a previous failed attempt — just update the password
      orgAdmin.passwordHash = hashedPassword;
      orgAdmin.isVerified = true;
      orgAdmin.isActive = true;
      await orgAdmin.save();
    }

    organization.isVerified = true;
    organization.verificationToken = undefined;
    await organization.save();

    const accessToken = this.generateAccessToken(orgAdmin, organization);
    const refreshToken = this.generateRefreshToken(orgAdmin);

    return {
      organization: this.sanitizeOrganization(organization),
      admin: this.sanitizeAdmin(orgAdmin),
      accessToken,
      refreshToken
    };
  }


  // Login Organization Admin
  async login(email: string, password: string, rememberMe: boolean = false) {
    const admin = await OrganizationAdminModel.findOne({ email })
      .select("+passwordHash")
      .populate('organization');

    if (!admin) {
      throw new Error("Invalid email or password");
    }

    if (!admin.isVerified) {
      throw new Error("Please verify your email first");
    }

    if (!admin.isActive) {
      throw new Error("Your account has been deactivated");
    }

    const organization = await OrganizationModel.findById(admin.organization);

    if (!organization || !organization.isActive) {
      throw new Error("Organization is inactive. Contact support.");
    }

    const isPasswordValid = await argon2.verify(admin.passwordHash!, password);
    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    admin.lastLogin = new Date();
    admin.lastActive = new Date();
    await admin.save();

    const accessToken = this.generateAccessToken(admin, organization);
    const refreshToken = this.generateRefreshToken(admin, rememberMe);

    return {
      organization: this.sanitizeOrganization(organization),
      admin: this.sanitizeAdmin(admin),
      accessToken,
      refreshToken
    };
  }

  async refreshToken(token: string) {
    try {
      const decoded = jwt.verify(token, ENV.JWT_REFRESH_SECRET) as any;
      const admin = await OrganizationAdminModel.findById(decoded.id).populate('organization');

      if (!admin) {
        throw new Error("Admin associated with token no longer exists");
      }

      if (!admin.isVerified) {
        throw new Error("Please verify your email first");
      }

      if (!admin.isActive) {
        throw new Error("Your account has been deactivated");
      }

      const organization = await OrganizationModel.findById(admin.organization);

      if (!organization || !organization.isActive) {
        throw new Error("Organization is inactive. Contact support.");
      }

      const rememberMe = Boolean(decoded.rememberMe);
      const accessToken = this.generateAccessToken(admin, organization);
      const refreshToken = this.generateRefreshToken(admin, rememberMe);

      return { accessToken, refreshToken, rememberMe };
    } catch (error) {
      throw new Error("Invalid or expired refresh token");
    }
  }

  // Update Organization Profile (e.g. logoUrl, name, address fields)
  async updateProfile(organizationId: string, updateData: {
    organizationName?: string;
    organizationType?: 'university' | 'college' | 'institute' | 'school' | 'other';
    logoUrl?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    contactEmail?: string;
    contactPhone?: string;
    website?: string;
  }) {
    const org = await OrganizationModel.findById(organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    if (updateData.organizationName !== undefined) org.organizationName = updateData.organizationName;
    if (updateData.organizationType !== undefined) org.organizationType = updateData.organizationType;
    if (updateData.logoUrl !== undefined) org.logoUrl = updateData.logoUrl;
    if (updateData.address !== undefined) org.address = updateData.address;
    if (updateData.city !== undefined) org.city = updateData.city;
    if (updateData.state !== undefined) org.state = updateData.state;
    if (updateData.pincode !== undefined) org.pincode = updateData.pincode;
    if (updateData.country !== undefined) org.country = updateData.country;
    if (updateData.contactEmail !== undefined) org.contactEmail = updateData.contactEmail;
    if (updateData.contactPhone !== undefined) org.contactPhone = updateData.contactPhone;
    if (updateData.website !== undefined) org.website = updateData.website;

    await org.save();
    return { organization: org };
  }

  // Get Organization Admin Profile
  async getAdminById(adminId: string) {
    const admin = await OrganizationAdminModel.findById(adminId)
      .populate('organization');

    if (!admin) {
      throw new Error("Admin not found");
    }

    const organization = await OrganizationModel.findById(admin.organization);

    return {
      organization: this.sanitizeOrganization(organization!),
      admin: this.sanitizeAdmin(admin)
    };
  }

  // Update Organization Admin personal profile (name + avatar only)
  // NOTE: This updates OrganizationAdminModel — completely isolated from UserModel
  async updateAdminProfile(adminId: string, updateData: {
    name?: string;
    avatar?: string;
  }) {
    const admin = await OrganizationAdminModel.findById(adminId);
    if (!admin) {
      throw new Error("Admin not found");
    }

    if (updateData.name !== undefined) admin.name = updateData.name;
    if (updateData.avatar !== undefined) admin.avatar = updateData.avatar;

    await admin.save();

    return { admin: this.sanitizeAdmin(admin) };
  }

  // Create Additional Organization Admin
  async createAdmin(organizationId: string, data: {
    name: string;
    email: string;
    mobile: string;
    designation: 'dean' | 'director' | 'principal' | 'admin' | 'other';
  }) {
    const existingAdmin = await OrganizationAdminModel.findOne({ email: data.email });
    if (existingAdmin) {
      throw new Error("Admin with this email already exists");
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");

    const admin = await OrganizationAdminModel.create({
      organization: organizationId,
      ...data,
      verificationToken,
      isVerified: false
    });

    const organization = await OrganizationModel.findById(organizationId);

    await sendOrganizationAdminInviteEmail(
      data.email,
      data.name,
      verificationToken,
      organization!.organizationName
    );

    // Update organization stats
    await this.updateOrganizationStats(organizationId);

    return {
      message: "Admin invited successfully. Verification email sent.",
      adminId: admin._id
    };
  }

  // Get Pending Student Approvals (All departments)
  async getPendingStudents(organizationId: string) {
    const students = await UserModel.find({
      organization: organizationId,
      organizationApprovalStatus: 'pending',
      isDeleted: false
    })
      .populate('department', 'departmentName departmentCode')
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    return students;
  }

  // Approve Student (Organization Admin can approve from any department)
  async approveStudent(adminId: string, studentId: string) {
    const admin = await OrganizationAdminModel.findById(adminId);

    if (!admin) {
      throw new Error("Admin not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      organization: admin.organization
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your organization");
    }

    if (student.organizationApprovalStatus === 'approved') {
      throw new Error("Student is already approved");
    }

    student.organizationApprovalStatus = 'approved';
    student.ApprovedBy = adminId as any;
    student.approvedByType = 'organization_admin';
    student.ApprovedAt = new Date();
    await student.save();

    // Update stats
    await this.updateOrganizationStats(admin.organization.toString());
    if (student.department) {
      await this.updateDepartmentStats(student.department.toString());
    }

    // Send approval email
    await sendStudentApprovalEmail(student.email, student.name);

    return { message: "Student approved successfully" };
  }

  // Reject Student
  async rejectStudent(adminId: string, studentId: string, reason?: string) {
    const admin = await OrganizationAdminModel.findById(adminId);

    if (!admin) {
      throw new Error("Admin not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      organization: admin.organization
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your organization");
    }

    student.organizationApprovalStatus = 'rejected';
    student.RejectedReason = reason || 'No reason provided';
    await student.save();

    // Update stats
    await this.updateOrganizationStats(admin.organization.toString());
    if (student.department) {
      await this.updateDepartmentStats(student.department.toString());
    }

    // Send rejection email
    await sendStudentRejectionEmail(student.email, student.name, reason);

    return { message: "Student rejected" };
  }

  // Get All Students in Organization
  async getStudents(organizationId: string, filters?: {
    status?: string;
    departmentId?: string;
    includePortfolio?: boolean;
  }) {
    const query: any = {
      organization: organizationId,
      isDeleted: false
    };

    if (filters?.status && filters.status !== "all") {
      const allowedStatuses = ["pending", "approved", "rejected"];
      if (!allowedStatuses.includes(filters.status)) {
        throw new Error("Invalid status filter");
      }
      query.organizationApprovalStatus = filters.status;
    }

    if (filters?.departmentId) {
      query.department = filters.departmentId;
    }

    const organization = await OrganizationModel.findById(organizationId)
      .select("subscriptionStatus subscriptionPlan subscriptionExpiry planSeatLimits");

    await this.backfillLegacyStudentPlans(organizationId, organization);

    const students = await UserModel.find(query)
      .populate('department', 'departmentName departmentCode')
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();

    const studentsWithEffectivePlan = students.map((student: any) => ({
      ...student,
      currentPlan: getEffectivePlan(student as any, organization),
    }));

    if (filters?.includePortfolio) {
      const studentIds = studentsWithEffectivePlan.map(s => s._id.toString());
      const holdings = await PortfolioHolding.find({ userId: { $in: studentIds } }).lean();

      // Group holdings by userId
      const holdingsByUser: Record<string, any[]> = {};
      for (const holding of holdings) {
        const uid = holding.userId.toString();
        if (!holdingsByUser[uid]) {
          holdingsByUser[uid] = [];
        }
        holdingsByUser[uid].push(holding);
      }

      // Compute summary for each student
      const studentsWithPortfolio = await Promise.all(
        studentsWithEffectivePlan.map(async (student: any) => {
          const studentHoldings = holdingsByUser[student._id.toString()] || [];
          const totalInvested = studentHoldings.reduce((sum, h) => sum + h.totalInvested, 0);
          const currentValue = studentHoldings.reduce((sum, h) => sum + h.currentValue, 0);
          const unrealizedPL = studentHoldings.reduce((sum, h) => sum + (h.unrealizedPL || 0), 0);
          const totalPL = currentValue - totalInvested;
          const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

          // Portfolio Allocation by Category
          const allocation: Record<string, number> = {};
          for (const h of studentHoldings) {
            const cat = h.category || 'OTHER';
            allocation[cat] = (allocation[cat] || 0) + h.totalInvested;
          }

          const portfolioSummary = {
            totalInvested,
            currentValue,
            totalPL,
            totalPLPercent: parseFloat(totalPLPercent.toFixed(2)),
            unrealizedPL,
            realizedPL: student.totalPaperPL || 0,
            portfolioAllocation: allocation,
            portfolioTurnover: student.portfolioTurnover || 0,
            maxDrawdown: student.maxDrawdown || 0
          };

          // Get paper trade stats
          const paperTrades = await PaperTradeModel.find({ user: student._id });
          const profitableTrades = paperTrades.filter(t => {
            // Support both potential field names for robustness based on schema differences
            const profit = (t as any).profitLoss ?? (t as any).pnl ?? (t as any).realizedPL ?? 0;
            return profit > 0;
          }).length;

          return {
            ...student,
            portfolioSummary,
            totalPaperTradesCount: paperTrades.length,
            profitablePaperTrades: profitableTrades
          };
        })
      );
      return studentsWithPortfolio;
    }

    return studentsWithEffectivePlan;
  }

  // Add Student Directly (No Approval Needed) - Organization Admin
  async addStudentDirectly(adminId: string, studentData: {
    name: string;
    email: string;
    departmentId: string;
    plan?: StudentPlan;
  }) {
    // Get admin details
    const admin = await OrganizationAdminModel.findById(adminId);

    if (!admin) {
      throw new Error("Admin not found");
    }

    if (!admin.isActive || !admin.isVerified) {
      throw new Error("Admin account is not active");
    }

    const organization = await OrganizationModel.findById(admin.organization).select("maxStudents planSeatLimits subscriptionStatus subscriptionExpiry");
    if (!organization) {
      throw new Error("Organization not found");
    }

    const configuredPlanSeats = organization.planSeatLimits || { Silver: 0, Gold: 0, Diamond: 0 };
    const hasMixedSeatAllocation =
      configuredPlanSeats.Silver > 0 ||
      configuredPlanSeats.Gold > 0 ||
      configuredPlanSeats.Diamond > 0;

    const seatLimit = organization.maxStudents || 0;
    if (!hasMixedSeatAllocation && seatLimit > 0) {
      const currentSeats = await UserModel.countDocuments({
        organization: admin.organization,
        isDeleted: false
      });

      if (currentSeats >= seatLimit) {
        throw new Error(`Student limit reached for this organization (${currentSeats}/${seatLimit})`);
      }
    }

    // Verify department belongs to organization
    const department = await DepartmentModel.findOne({
      _id: studentData.departmentId,
      organization: admin.organization
    });

    if (!department) {
      throw new Error("Department not found or doesn't belong to your organization");
    }

    const normalizedEmail = studentData.email.trim().toLowerCase();

    // Check if email already exists
    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new Error("A user with this email already exists");
    }

    const assignedPlan = normalizeStudentPlan(studentData.plan || "Free");
    this.assertOrganizationCanAssignPaidPlan(organization, assignedPlan);
    if (assignedPlan !== "Free" && hasMixedSeatAllocation) {
      const limitForPlan = configuredPlanSeats[assignedPlan];
      if (limitForPlan <= 0) {
        throw new Error(`${assignedPlan} seat is not enabled for this organization`);
      }

      const usedPlanSeats = await UserModel.countDocuments({
        organization: admin.organization,
        isDeleted: false,
        currentPlan: assignedPlan,
      });

      if (usedPlanSeats >= limitForPlan) {
        throw new Error(`${assignedPlan} seat limit reached (${usedPlanSeats}/${limitForPlan})`);
      }
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Create user with pre-approved status
    const student = await UserModel.create({
      name: studentData.name.trim(),
      email: normalizedEmail,
      organization: admin.organization,
      department: studentData.departmentId,
      organizationApprovalStatus: 'approved', // Pre-approved
      ApprovedBy: adminId as any,
      approvedByType: 'organization_admin',
      ApprovedAt: new Date(),
      isVerified: false, // Still needs to set password
      verificationToken,
      isActive: true,
      ...buildStudentPlanFields(assignedPlan)
    });

    // Send verification email
    const { sendVerificationEmail } = await import('./email');
    await sendVerificationEmail(normalizedEmail, verificationToken);

    // Update stats
    await this.updateOrganizationStats(admin.organization.toString());
    await this.updateDepartmentStats(studentData.departmentId);

    return {
      message: "Student added successfully. Verification email sent.",
      studentId: student._id
    };
  }

  // Import Students from CSV (Bulk Addition) - Organization Admin
  async importStudentsFromCSV(adminId: string, csvData: Array<Record<string, any> & {
    name: string;
    email: string;
    department: string;
    plan?: string;
  }>) {
    // Get admin details
    const admin = await OrganizationAdminModel.findById(adminId);

    if (!admin) {
      throw new Error("Admin not found");
    }

    if (!admin.isActive || !admin.isVerified) {
      throw new Error("Admin account is not active");
    }

    const organization = await OrganizationModel.findById(admin.organization).select("maxStudents planSeatLimits subscriptionStatus subscriptionExpiry");
    if (!organization) {
      throw new Error("Organization not found");
    }

    // Get all departments for this organization
    const departments = await DepartmentModel.find({
      organization: admin.organization,
      isDeleted: false
    });

    if (departments.length === 0) {
      throw new Error("No departments found in your organization");
    }

    const configuredPlanSeats = organization.planSeatLimits || { Silver: 0, Gold: 0, Diamond: 0 };
    const hasMixedSeatAllocation =
      configuredPlanSeats.Silver > 0 ||
      configuredPlanSeats.Gold > 0 ||
      configuredPlanSeats.Diamond > 0;

    const seatLimit = organization.maxStudents || 0;
    const existingSeats = !hasMixedSeatAllocation && seatLimit > 0
      ? await UserModel.countDocuments({ organization: admin.organization, isDeleted: false })
      : 0;
    let seatsConsumedInBatch = 0;

    const existingPaidPlanUsage = hasMixedSeatAllocation
      ? {
        Silver: await UserModel.countDocuments({ organization: admin.organization, isDeleted: false, currentPlan: "Silver" }),
        Gold: await UserModel.countDocuments({ organization: admin.organization, isDeleted: false, currentPlan: "Gold" }),
        Diamond: await UserModel.countDocuments({ organization: admin.organization, isDeleted: false, currentPlan: "Diamond" }),
      }
      : { Silver: 0, Gold: 0, Diamond: 0 };

    const addedPaidPlanUsage = { Silver: 0, Gold: 0, Diamond: 0 };

    // Create a map for quick department lookup (by name and code)
    const departmentMap = new Map<string, any>();
    departments.forEach(dept => {
      departmentMap.set(dept.departmentName.toLowerCase(), dept);
      departmentMap.set(dept.departmentCode.toLowerCase(), dept);
    });

    const results = {
      added: [] as Array<{ name: string; email: string; department: string; plan: string }>,
      skipped: [] as Array<{ name: string; email: string; reason: string }>,
      errors: [] as Array<{ row: number; name: string; email: string; error: string }>
    };

    const seenEmails = new Set<string>();
    const affectedDepartmentIds = new Set<string>();

    // Process each row
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];

      try {
        // Validate required fields
        if (!row.name || !row.email || !row.department) {
          results.errors.push({
            row: i + 1,
            name: row.name || '',
            email: row.email || '',
            error: 'Missing required fields (name, email, or department)'
          });
          continue;
        }

        const normalizedEmail = String(row.email).trim().toLowerCase();

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
          results.errors.push({
            row: i + 1,
            name: row.name,
            email: row.email,
            error: 'Invalid email format'
          });
          continue;
        }

        // Find department by name or code
        const deptKey = String(row.department).trim().toLowerCase();
        const department = departmentMap.get(deptKey);

        if (!department) {
          results.skipped.push({
            name: row.name,
            email: row.email,
            reason: `Department "${row.department}" not found in your organization`
          });
          continue;
        }

        if (!hasMixedSeatAllocation && seatLimit > 0 && existingSeats + seatsConsumedInBatch >= seatLimit) {
          results.skipped.push({
            name: row.name,
            email: row.email,
            reason: `Student limit reached for organization (${existingSeats + seatsConsumedInBatch}/${seatLimit})`
          });
          continue;
        }

        // Check if email already exists
        const existingUser = await UserModel.findOne({ email: normalizedEmail });
        if (existingUser) {
          results.skipped.push({
            name: row.name,
            email: row.email,
            reason: 'Email already exists in system'
          });
          continue;
        }

        // Check for duplicate within this CSV batch
        if (seenEmails.has(normalizedEmail)) {
          results.skipped.push({
            name: row.name,
            email: row.email,
            reason: 'Duplicate email in CSV file'
          });
          continue;
        }

        const assignedPlan = extractStudentPlanFromCsvRow(row as Record<string, any>);
        this.assertOrganizationCanAssignPaidPlan(organization, assignedPlan);

        if (assignedPlan !== "Free" && hasMixedSeatAllocation) {
          const limitForPlan = configuredPlanSeats[assignedPlan];
          if (limitForPlan <= 0) {
            results.skipped.push({
              name: row.name,
              email: row.email,
              reason: `${assignedPlan} seat is not enabled for this organization`
            });
            continue;
          }

          if (existingPaidPlanUsage[assignedPlan] + addedPaidPlanUsage[assignedPlan] >= limitForPlan) {
            results.skipped.push({
              name: row.name,
              email: row.email,
              reason: `${assignedPlan} seat limit reached (${existingPaidPlanUsage[assignedPlan] + addedPaidPlanUsage[assignedPlan]}/${limitForPlan})`
            });
            continue;
          }
        }

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");

        // Create user with pre-approved status
        await UserModel.create({
          name: String(row.name).trim(),
          email: normalizedEmail,
          organization: admin.organization,
          department: department._id,
          organizationApprovalStatus: 'approved', // Pre-approved
          ApprovedBy: adminId as any,
          approvedByType: 'organization_admin',
          ApprovedAt: new Date(),
          isVerified: false,
          verificationToken,
          isActive: true,
          ...buildStudentPlanFields(assignedPlan)
        });

        // Send verification email
        const { sendVerificationEmail } = await import('./email');
        await sendVerificationEmail(normalizedEmail, verificationToken);

        seenEmails.add(normalizedEmail);
        affectedDepartmentIds.add(String(department._id));
        seatsConsumedInBatch += 1;

        if (assignedPlan !== "Free" && hasMixedSeatAllocation) {
          addedPaidPlanUsage[assignedPlan] += 1;
        }

        results.added.push({
          name: row.name,
          email: normalizedEmail,
          department: department.departmentName,
          plan: assignedPlan
        });

      } catch (error: any) {
        results.errors.push({
          row: i + 1,
          name: row.name || '',
          email: row.email || '',
          error: error.message || 'Unknown error'
        });
      }
    }

    // Update stats if any students were added
    if (results.added.length > 0) {
      await this.updateOrganizationStats(admin.organization.toString());

      // Update stats for all affected departments
      for (const deptId of affectedDepartmentIds) {
        await this.updateDepartmentStats(deptId);
      }
    }

    return {
      message: `Import completed: ${results.added.length} added, ${results.skipped.length} skipped, ${results.errors.length} errors`,
      summary: {
        totalProcessed: csvData.length,
        successfullyAdded: results.added.length,
        skipped: results.skipped.length,
        errors: results.errors.length
      },
      details: results
    };
  }

  // Get Student by ID
  async getStudentById(organizationId: string, studentId: string) {
    const organization = await OrganizationModel.findById(organizationId)
      .select("subscriptionStatus subscriptionPlan subscriptionExpiry planSeatLimits");
    await this.backfillLegacyStudentPlans(organizationId, organization);
    const student = await UserModel.findOne({
      _id: studentId,
      organization: organizationId,
      isDeleted: false
    })
      .populate('department', 'departmentName departmentCode')
      .select('-passwordHash');

    if (!student) {
      throw new Error("Student not found or doesn't belong to your organization");
    }

    const studentObject = student.toObject();
    return {
      ...studentObject,
      currentPlan: getEffectivePlan(studentObject as any, organization),
    };
  }

  // Update Student
  async updateStudent(adminId: string, studentId: string, updateData: {
    name?: string;
    email?: string;
    plan?: StudentPlan;
  }) {
    const admin = await OrganizationAdminModel.findById(adminId);

    if (!admin) {
      throw new Error("Admin not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      organization: admin.organization,
      isDeleted: false
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your organization");
    }

    // If updating email, check for duplicates
    if (updateData.email && updateData.email !== student.email) {
      const existingUser = await UserModel.findOne({ email: updateData.email });
      if (existingUser) {
        throw new Error("A user with this email already exists");
      }
    }

    // Update fields
    if (updateData.name) student.name = updateData.name;
    if (updateData.email) student.email = updateData.email;
    if (updateData.plan !== undefined) {
      const nextPlan = normalizeStudentPlan(updateData.plan);

      if (nextPlan !== student.currentPlan) {
        const organization = await OrganizationModel.findById(admin.organization).select("planSeatLimits subscriptionStatus subscriptionExpiry");
        const configuredPlanSeats = organization?.planSeatLimits || { Silver: 0, Gold: 0, Diamond: 0 };
        const hasMixedSeatAllocation =
          configuredPlanSeats.Silver > 0 ||
          configuredPlanSeats.Gold > 0 ||
          configuredPlanSeats.Diamond > 0;

        this.assertOrganizationCanAssignPaidPlan(organization, nextPlan);

        if (nextPlan !== "Free" && hasMixedSeatAllocation) {
          const limitForPlan = configuredPlanSeats[nextPlan];
          if (limitForPlan <= 0) {
            throw new Error(`${nextPlan} seat is not enabled for this organization`);
          }

          const usedPlanSeats = await UserModel.countDocuments({
            organization: admin.organization,
            isDeleted: false,
            currentPlan: nextPlan,
          });

          if (usedPlanSeats >= limitForPlan) {
            throw new Error(`${nextPlan} seat limit reached (${usedPlanSeats}/${limitForPlan})`);
          }
        }

        Object.assign(student, buildStudentPlanFields(nextPlan));
      }
    }

    await student.save();

    const organization = await OrganizationModel.findById(admin.organization)
      .select("subscriptionStatus subscriptionPlan subscriptionExpiry planSeatLimits");
    const updatedStudent = await UserModel.findById(studentId)
      .populate('department', 'departmentName departmentCode')
      .select('-passwordHash');
    const updatedStudentObject = updatedStudent!.toObject();

    return {
      message: "Student updated successfully",
      student: {
        ...updatedStudentObject,
        currentPlan: getEffectivePlan(updatedStudentObject as any, organization),
      }
    };
  }

  // Archive Student (Soft Delete)
  async archiveStudent(adminId: string, studentId: string) {
    const admin = await OrganizationAdminModel.findById(adminId);

    if (!admin) {
      throw new Error("Admin not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      organization: admin.organization,
      isDeleted: false
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your organization");
    }

    if (student.isDeleted) {
      throw new Error("Student is already archived");
    }

    // Soft delete
    student.isDeleted = true;
    student.deletedAt = new Date();
    student.isActive = false;
    await student.save();

    // Update stats
    await this.updateOrganizationStats(admin.organization.toString());
    if (student.department) {
      await this.updateDepartmentStats(student.department.toString());
    }

    return {
      message: "Student archived successfully"
    };
  }

  // Unarchive Student
  async unarchiveStudent(adminId: string, studentId: string) {
    const admin = await OrganizationAdminModel.findById(adminId);

    if (!admin) {
      throw new Error("Admin not found");
    }

    // Find student in organization (even if deleted)
    const student = await UserModel.findOne({
      _id: studentId,
      organization: admin.organization
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your organization");
    }

    if (!student.isDeleted) {
      throw new Error("Student is not archived");
    }

    // Restore
    student.isDeleted = false;
    student.deletedAt = undefined;
    student.isActive = true;
    await student.save();

    // Update stats
    await this.updateOrganizationStats(admin.organization.toString());
    if (student.department) {
      await this.updateDepartmentStats(student.department.toString());
    }

    return {
      message: "Student unarchived successfully"
    };
  }

  // Get Student Portfolio
  async getStudentPortfolio(organizationId: string, studentId: string) {
    // Verify student belongs to organization
    const student = await UserModel.findOne({
      _id: studentId,
      organization: organizationId,
      isDeleted: false
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your organization");
    }

    // Get portfolio holdings
    const holdings = await PortfolioHolding.find({ userId: studentId })
      .sort({ currentValue: -1 })
      .lean();

    // Get all executed trades for this student
    const trades = await PaperTradeModel.find({
      userId: studentId,
      status: 'EXECUTED'
    }).sort({ executedAt: 1 }).lean();

    // Group trades by symbol
    const tradesBySymbol: Record<string, any[]> = {};
    for (const trade of trades) {
      if (!tradesBySymbol[trade.symbol]) {
        tradesBySymbol[trade.symbol] = [];
      }
      tradesBySymbol[trade.symbol].push({
        date: trade.executedAt || (trade as any).createdAt,
        type: trade.type,
        quantity: trade.quantity,
        price: trade.price,
        totalAmount: trade.totalAmount,
        reason: trade.reason
      });
    }

    // Attach transactions to each holding
    const holdingsWithTransactions = holdings.map(h => ({
      ...h,
      transactions: tradesBySymbol[h.symbol] || []
    }));

    // Calculate summary
    const totalInvested = holdings.reduce((sum, h) => sum + h.totalInvested, 0);
    const currentValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalPL = currentValue - totalInvested;
    const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

    return {
      student: {
        id: student._id,
        name: student.name,
        email: student.email
      },
      holdings: holdingsWithTransactions,
      summary: {
        totalHoldings: holdings.length,
        totalInvested,
        currentValue,
        totalPL,
        totalPLPercent: parseFloat(totalPLPercent.toFixed(2))
      }
    };
  }


  // Get Organization Statistics
  async getOrganizationStats(organizationId: string) {
    const organization = await OrganizationModel.findById(organizationId);

    const departments = await DepartmentModel.find({
      organization: organizationId,
      isDeleted: false
    });

    const totalAdmins = await OrganizationAdminModel.countDocuments({
      organization: organizationId,
      isDeleted: false
    });

    const totalCoordinators = await DepartmentCoordinatorModel.countDocuments({
      organization: organizationId,
      isDeleted: false
    });

    const totalStudents = await UserModel.countDocuments({
      organization: organizationId,
      isDeleted: false
    });

    const activeStudents = await UserModel.countDocuments({
      organization: organizationId,
      organizationApprovalStatus: 'approved',
      isActive: true,
      isDeleted: false
    });

    const pendingApprovals = await UserModel.countDocuments({
      organization: organizationId,
      organizationApprovalStatus: 'pending',
      isDeleted: false
    });

    const planStudents = await UserModel.find({
      organization: organizationId,
      isDeleted: false
    }).select("organization organizationApprovalStatus currentPlan subscriptionExpiry isOnTrial trialEndDate");

    const planWiseStudents = {
      Free: 0,
      Silver: 0,
      Gold: 0,
      Diamond: 0
    };

    for (const student of planStudents) {
      const effectivePlan = getEffectivePlan(student as any, organization);
      planWiseStudents[effectivePlan] += 1;
    }

    const seatLimit = organization?.maxStudents || 0;
    const configuredPlanSeats = organization?.planSeatLimits || { Silver: 0, Gold: 0, Diamond: 0 };
    const remainingSeats = seatLimit > 0 ? Math.max(seatLimit - totalStudents, 0) : null;

    return {
      organization: this.sanitizeOrganization(organization!),
      stats: {
        totalDepartments: departments.length,
        totalAdmins,
        totalCoordinators,
        totalStudents,
        activeStudents,
        pendingApprovals,
        planWiseStudents,
        configuredPlanSeats,
        seatUsage: {
          maxStudents: seatLimit,
          usedSeats: totalStudents,
          remainingSeats,
          isUnlimited: seatLimit === 0
        }
      },
      departments: departments.map(d => ({
        id: d._id,
        name: d.departmentName,
        code: d.departmentCode,
        totalStudents: d.totalStudents,
        activeStudents: d.activeStudents
      }))
    };
  }

  // Bulk Archive Students
  async bulkArchiveStudents(adminId: string, studentIds: string[]) {
    const admin = await OrganizationAdminModel.findById(adminId);
    if (!admin) throw new Error("Admin not found");

    // Only archive students belonging to this organization that are not already archived
    const result = await UserModel.updateMany(
      { _id: { $in: studentIds }, organization: admin.organization, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), isActive: false } }
    );

    // Refresh stats
    await this.updateOrganizationStats(admin.organization.toString());
    // Get affected departments to update their stats
    const affectedStudents = await UserModel.find({ _id: { $in: studentIds } }).select('department');
    const deptIds = [...new Set(affectedStudents.map(s => s.department?.toString()).filter(Boolean))];
    for (const deptId of deptIds) {
      await this.updateDepartmentStats(deptId!);
    }

    return { message: `${result.modifiedCount} student(s) archived successfully`, modifiedCount: result.modifiedCount };
  }

  // Bulk Unarchive Students
  async bulkUnarchiveStudents(adminId: string, studentIds: string[]) {
    const admin = await OrganizationAdminModel.findById(adminId);
    if (!admin) throw new Error("Admin not found");

    const result = await UserModel.updateMany(
      { _id: { $in: studentIds }, organization: admin.organization, isDeleted: true },
      { $set: { isDeleted: false, isActive: true }, $unset: { deletedAt: 1 } }
    );

    await this.updateOrganizationStats(admin.organization.toString());
    const affectedStudents = await UserModel.find({ _id: { $in: studentIds } }).select('department');
    const deptIds = [...new Set(affectedStudents.map(s => s.department?.toString()).filter(Boolean))];
    for (const deptId of deptIds) {
      await this.updateDepartmentStats(deptId!);
    }

    return { message: `${result.modifiedCount} student(s) unarchived successfully`, modifiedCount: result.modifiedCount };
  }

  // Update Organization Stats
  private async updateOrganizationStats(organizationId: string) {
    const totalDepartments = await DepartmentModel.countDocuments({
      organization: organizationId,
      isDeleted: false
    });

    const totalAdmins = await OrganizationAdminModel.countDocuments({
      organization: organizationId,
      isDeleted: false
    });

    const totalCoordinators = await DepartmentCoordinatorModel.countDocuments({
      organization: organizationId,
      isDeleted: false
    });

    const totalStudents = await UserModel.countDocuments({
      organization: organizationId,
      isDeleted: false
    });

    const activeStudents = await UserModel.countDocuments({
      organization: organizationId,
      organizationApprovalStatus: 'approved',
      isActive: true,
      isDeleted: false
    });

    const pendingApprovals = await UserModel.countDocuments({
      organization: organizationId,
      organizationApprovalStatus: 'pending',
      isDeleted: false
    });

    await OrganizationModel.findByIdAndUpdate(organizationId, {
      totalDepartments,
      totalAdmins,
      totalCoordinators,
      totalStudents,
      activeStudents,
      pendingApprovals
    });
  }

  // ============================================
  // RECONCILIATION & AI REPORTS
  // ============================================

  // Reconcile All Students (Organization Level)
  async reconcileStudents(adminId: string) {
    const admin = await OrganizationAdminModel.findById(adminId);
    if (!admin) {
      throw new Error("Admin not found");
    }

    const organization = await OrganizationModel.findById(admin.organization).select("subscriptionStatus subscriptionExpiry");
    this.assertOrganizationPremiumActive(organization, "AI reconciliation");

    // Get all non-deleted, approved students in the organization
    const students = await UserModel.find({
      organization: admin.organization,
      isDeleted: false,
      organizationApprovalStatus: 'approved'
    }).select('_id name email');

    if (students.length === 0) {
      return { processed: 0, total: 0, message: "No approved students found in your organization" };
    }

    let processed = 0;
    const errors: string[] = [];

    // Process students sequentially
    for (const student of students) {
      try {
        const portfolio = await PortfolioHolding.find({ userId: student._id.toString() }).lean();

        let analysis: string;

        if (portfolio.length === 0) {
          analysis = "Your portfolio is empty. Start by making your first paper trade!";
        } else {
          const portfolioSummary = portfolio.map(h => ({
            stock: `${h.stockName} (${h.symbol})`,
            quantity: h.quantity,
            invested: h.totalInvested,
            current: h.currentValue,
            pl: h.unrealizedPL,
            plPercent: h.unrealizedPLPercent.toFixed(2)
          }));

          // Call the dedicated portfolio report generator
          analysis = await aiChatbotService.generatePortfolioReport(portfolioSummary);
        }

        await UserModel.updateOne(
          { _id: student._id },
          {
            $set: {
              portfolioReport: {
                analysis,
                generatedAt: new Date()
              }
            }
          }
        );

        processed++;
      } catch (err: any) {
        console.error(`Reconcile error for ${student.name}:`, err.message);
        errors.push(`${student.name}: ${err.message}`);
      }
    }

    return {
      processed,
      total: students.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully generated reports for ${processed}/${students.length} students`
    };
  }

  // Get Student AI Report
  async getStudentReport(adminId: string, studentId: string) {
    const admin = await OrganizationAdminModel.findById(adminId);
    if (!admin) {
      throw new Error("Admin not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      organization: admin.organization,
      isDeleted: false
    }).select('name email portfolioReport');

    if (!student) {
      throw new Error("Student not found or doesn't belong to your organization");
    }

    if (!student.portfolioReport?.analysis) {
      throw new Error("No report available for this student. Run Reconciliation first.");
    }

    return {
      student: { id: student._id, name: student.name, email: student.email },
      report: student.portfolioReport
    };
  }

  // Submit Teacher Review for a Student
  async submitTeacherReview(adminId: string, studentId: string, reviewData: {
    factor1Rating: number;
    factor2Rating: number;
    factor3Rating: number;
    suggestions?: string;
  }) {
    const admin = await OrganizationAdminModel.findById(adminId);
    if (!admin) {
      throw new Error('Admin not found');
    }

    const student = await UserModel.findOne({
      _id: studentId,
      organization: admin.organization,
      isDeleted: false
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your organization");
    }

    if (!student.portfolioReport?.analysis) {
      throw new Error('No AI report found for this student. Run Reconciliation first.');
    }

    // Validate ratings are 1–5
    const ratings = [reviewData.factor1Rating, reviewData.factor2Rating, reviewData.factor3Rating];
    for (const rating of ratings) {
      if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        throw new Error('Each rating must be an integer between 1 and 5');
      }
    }

    // Calculate aggregate score out of 100
    // (Factor 1 + Factor 2 + Factor 3) / 15 * 100
    const totalScore = reviewData.factor1Rating + reviewData.factor2Rating + reviewData.factor3Rating;
    const aggregateScore = parseFloat(((totalScore / 15) * 100).toFixed(1));

    student.teacherReview = {
      factor1Rating: reviewData.factor1Rating,
      factor2Rating: reviewData.factor2Rating,
      factor3Rating: reviewData.factor3Rating,
      aggregateScore,
      suggestions: reviewData.suggestions || '',
      reviewedBy: admin._id as any,
      reviewedAt: new Date()
    };

    await student.save();

    return {
      message: 'Review submitted successfully',
      aggregateScore
    };
  }

  // Update Department Stats
  private async updateDepartmentStats(departmentId: string) {
    const totalStudents = await UserModel.countDocuments({
      department: departmentId,
      isDeleted: false
    });

    const activeStudents = await UserModel.countDocuments({
      department: departmentId,
      organizationApprovalStatus: 'approved',
      isActive: true,
      isDeleted: false
    });

    await DepartmentModel.findByIdAndUpdate(departmentId, {
      totalStudents,
      activeStudents
    });
  }

  // Helper: Generate Tokens
  private generateAccessToken(admin: any, organization: IOrganization) {
    return jwt.sign(
      {
        id: admin._id,
        email: admin.email,
        role: 'organization_admin',
        name: admin.name,
        organization: organization._id,
        organizationName: organization.organizationName,
        isActive: admin.isActive
      },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN as any }
    );
  }

  private generateRefreshToken(admin: any, rememberMe: boolean = false) {
    return jwt.sign(
      { id: admin._id, rememberMe },
      ENV.JWT_REFRESH_SECRET,
      { expiresIn: rememberMe ? "30d" : ENV.JWT_REFRESH_EXPIRES_IN as any }
    );
  }

  private getSingleAllocatedPlan(planSeatLimits?: {
    Silver?: number;
    Gold?: number;
    Diamond?: number;
  }): StudentPlan | null {
    const configuredPlans = (['Silver', 'Gold', 'Diamond'] as const).filter(
      (plan) => (planSeatLimits?.[plan] || 0) > 0
    );

    return configuredPlans.length === 1 ? configuredPlans[0] : null;
  }

  private async backfillLegacyStudentPlans(
    organizationId: string,
    organization: Pick<IOrganization, 'subscriptionStatus' | 'subscriptionPlan' | 'subscriptionExpiry' | 'planSeatLimits'> | null,
    preferredPlan?: StudentPlan | null
  ) {
    if (!organization || organization.subscriptionStatus !== 'active' || !organization.subscriptionPlan) {
      return;
    }

    if (organization.subscriptionExpiry && new Date(organization.subscriptionExpiry) <= new Date()) {
      return;
    }

    const configuredPlanSeats = organization.planSeatLimits || { Silver: 0, Gold: 0, Diamond: 0 };
    const hasMixedSeatAllocation =
      (configuredPlanSeats.Silver || 0) > 0 ||
      (configuredPlanSeats.Gold || 0) > 0 ||
      (configuredPlanSeats.Diamond || 0) > 0;

    if (!hasMixedSeatAllocation) {
      return;
    }

    const fallbackPlan = preferredPlan || this.getSingleAllocatedPlan(configuredPlanSeats);
    if (!fallbackPlan || fallbackPlan === 'Free' || (configuredPlanSeats[fallbackPlan] || 0) <= 0) {
      return;
    }

    const candidates = await UserModel.find({
      organization: organizationId,
      isDeleted: false,
      organizationApprovalStatus: 'approved',
      $or: [
        { currentPlan: 'Free' },
        { currentPlan: { $exists: false } },
        { currentPlan: null }
      ]
    }).select("_id organization organizationApprovalStatus currentPlan subscriptionExpiry isOnTrial trialEndDate");

    if (!candidates.length) {
      return;
    }

    const candidateIds = new Set(candidates.map((candidate) => candidate._id.toString()));
    const existingUsers = await UserModel.find({
      organization: organizationId,
      isDeleted: false
    }).select("organization organizationApprovalStatus currentPlan subscriptionExpiry isOnTrial trialEndDate");

    let usedSeatsForFallbackPlan = 0;

    for (const user of existingUsers) {
      if (candidateIds.has(user._id.toString())) {
        continue;
      }

      if (getEffectivePlan(user as any, organization) === fallbackPlan) {
        usedSeatsForFallbackPlan += 1;
      }
    }

    const availableSeats = (configuredPlanSeats[fallbackPlan] || 0) - usedSeatsForFallbackPlan;
    if (availableSeats < candidates.length) {
      return;
    }

    await UserModel.updateMany(
      { _id: { $in: candidates.map((candidate) => candidate._id) } },
      { $set: buildStudentPlanFields(fallbackPlan) }
    );
  }

  private isOrganizationPremiumActive(
    organization: Pick<IOrganization, 'subscriptionStatus' | 'subscriptionExpiry'> | null
  ) {
    return !!organization &&
      organization.subscriptionStatus === 'active' &&
      (!organization.subscriptionExpiry || new Date(organization.subscriptionExpiry) > new Date());
  }

  private assertOrganizationPremiumActive(
    organization: Pick<IOrganization, 'subscriptionStatus' | 'subscriptionExpiry'> | null,
    featureName: string
  ) {
    if (!this.isOrganizationPremiumActive(organization)) {
      throw new Error(`${featureName} is unavailable because this organization's subscription is inactive or expired.`);
    }
  }

  private assertOrganizationCanAssignPaidPlan(
    organization: Pick<IOrganization, 'subscriptionStatus' | 'subscriptionExpiry'> | null,
    plan: StudentPlan
  ) {
    if (plan !== 'Free') {
      this.assertOrganizationPremiumActive(organization, "Paid student plan assignment");
    }
  }

  private sanitizeOrganization(organization: IOrganization) {
    return {
      id: organization._id,
      organizationName: organization.organizationName,
      organizationType: organization.organizationType,
      logoUrl: organization.logoUrl,
      address: organization.address,
      city: organization.city,
      state: organization.state,
      pincode: organization.pincode,
      country: organization.country,
      contactEmail: organization.contactEmail,
      contactPhone: organization.contactPhone,
      website: organization.website,
      isVerified: organization.isVerified,
      isActive: organization.isActive,
      registeredBy: organization.registeredBy,
      subscriptionStatus: organization.subscriptionStatus,
      subscriptionPlan: organization.subscriptionPlan,
      subscriptionExpiry: organization.subscriptionExpiry,
      maxStudents: organization.maxStudents,
      planSeatLimits: organization.planSeatLimits || { Silver: 0, Gold: 0, Diamond: 0 },
      planExpiryDates: organization.planExpiryDates || {},
      totalDepartments: organization.totalDepartments,
      totalAdmins: organization.totalAdmins,
      totalCoordinators: organization.totalCoordinators,
      totalStudents: organization.totalStudents,
      activeStudents: organization.activeStudents,
      pendingApprovals: organization.pendingApprovals,
      createdAt: organization.createdAt,
    };
  }

  private sanitizeAdmin(admin: any) {
    return {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      mobile: admin.mobile,
      designation: admin.designation,
      role: admin.role,
      avatar: admin.avatar ?? null, // always include — isolated from UserModel
      isVerified: admin.isVerified,
      isActive: admin.isActive
    };
  }

  // Get Public List of Organizations (for registration dropdown)
  async getPublicList() {
    return await OrganizationModel.find({
      isVerified: true,
      isActive: true,
      isDeleted: false
    })
      .select('_id organizationName organizationType city state')
      .sort({ organizationName: 1 });
  }

  // Get All Organizations (for platform admin)
  async getAllOrganizations(filters?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const query: any = { isDeleted: { $ne: true } };

    if (filters?.search) {
      query.$or = [
        { organizationName: { $regex: filters.search, $options: 'i' } },
        { contactEmail: { $regex: filters.search, $options: 'i' } },
        { city: { $regex: filters.search, $options: 'i' } }
      ];
    }

    const organizations = await OrganizationModel.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const organizationsWithSeatUsage = await Promise.all(
      organizations.map(async (organization) => {
        const users = await UserModel.find({
          organization: organization._id,
          isDeleted: false,
          organizationApprovalStatus: 'approved',
        }).select('organization organizationApprovalStatus currentPlan subscriptionExpiry subscriptionId isOnTrial trialEndDate');

        const planUsage = {
          Silver: 0,
          Gold: 0,
          Diamond: 0,
        };

        for (const user of users) {
          const effectivePlan = getEffectivePlan(user as any, organization);
          if (effectivePlan === 'Silver' || effectivePlan === 'Gold' || effectivePlan === 'Diamond') {
            planUsage[effectivePlan] += 1;
          }
        }

        const paidSeatCapacity =
          (organization.planSeatLimits?.Silver || 0) +
          (organization.planSeatLimits?.Gold || 0) +
          (organization.planSeatLimits?.Diamond || 0);

        return {
          ...organization.toObject(),
          paidSeatUsage: planUsage,
          paidSeatsUsed: planUsage.Silver + planUsage.Gold + planUsage.Diamond,
          paidSeatCapacity,
        };
      })
    );

    const total = await OrganizationModel.countDocuments(query);

    return {
      organizations: organizationsWithSeatUsage,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Activate Organization Subscription (for platform admin — manual activation)
  async activateOrgSubscription(organizationId: string, data: {
    subscriptionPlan: 'Silver' | 'Gold' | 'Diamond';
    subscriptionExpiry: Date;
    maxStudents?: number;
    planAllocations?: {
      Silver?: number;
      Gold?: number;
      Diamond?: number;
    };
    planExpiryDates?: {
      Silver?: Date;
      Gold?: Date;
      Diamond?: Date;
    };
  }) {
    const organization = await OrganizationModel.findById(organizationId);
    if (!organization) throw new Error('Organization not found');
    const previousSubscriptionPlan = organization.subscriptionPlan;
    const previousSubscriptionStatus = organization.subscriptionStatus;

    const currentStudents = await UserModel.countDocuments({
      organization: organizationId,
      isDeleted: false
    });

    const normalizedPlanAllocations = {
      Silver: data.planAllocations?.Silver || 0,
      Gold: data.planAllocations?.Gold || 0,
      Diamond: data.planAllocations?.Diamond || 0,
    };
    const hadMixedSeatAllocation =
      (organization.planSeatLimits?.Silver || 0) > 0 ||
      (organization.planSeatLimits?.Gold || 0) > 0 ||
      (organization.planSeatLimits?.Diamond || 0) > 0;

    const hasMixedSeatAllocation =
      normalizedPlanAllocations.Silver > 0 ||
      normalizedPlanAllocations.Gold > 0 ||
      normalizedPlanAllocations.Diamond > 0;

    const allocationTotal =
      normalizedPlanAllocations.Silver +
      normalizedPlanAllocations.Gold +
      normalizedPlanAllocations.Diamond;

    const resolvedMaxStudents = data.maxStudents !== undefined
      ? data.maxStudents
      : hasMixedSeatAllocation
        ? allocationTotal
        : (organization.maxStudents || 0);

    if (resolvedMaxStudents > 0 && currentStudents > resolvedMaxStudents) {
      throw new Error(
        `Cannot activate with maxStudents=${resolvedMaxStudents}. Organization already has ${currentStudents} registered students.`
      );
    }

    if (hasMixedSeatAllocation && resolvedMaxStudents > 0 && allocationTotal > resolvedMaxStudents) {
      throw new Error(
        `Plan seat allocation total (${allocationTotal}) cannot exceed maxStudents (${resolvedMaxStudents}).`
      );
    }

    if (hasMixedSeatAllocation) {
      const existingUsers = await UserModel.find({
        organization: organizationId,
        isDeleted: false
      }).select("organization organizationApprovalStatus currentPlan subscriptionExpiry isOnTrial trialEndDate");

      let usedSilver = 0;
      let usedGold = 0;
      let usedDiamond = 0;

      for (const user of existingUsers) {
        const effectivePlan = getEffectivePlan(user as any, organization);
        if (effectivePlan === 'Silver') usedSilver += 1;
        if (effectivePlan === 'Gold') usedGold += 1;
        if (effectivePlan === 'Diamond') usedDiamond += 1;
      }

      if (usedSilver > normalizedPlanAllocations.Silver) {
        throw new Error(`Silver seats too low. Already assigned: ${usedSilver}, requested: ${normalizedPlanAllocations.Silver}.`);
      }
      if (usedGold > normalizedPlanAllocations.Gold) {
        throw new Error(`Gold seats too low. Already assigned: ${usedGold}, requested: ${normalizedPlanAllocations.Gold}.`);
      }
      if (usedDiamond > normalizedPlanAllocations.Diamond) {
        throw new Error(`Diamond seats too low. Already assigned: ${usedDiamond}, requested: ${normalizedPlanAllocations.Diamond}.`);
      }
    }

    organization.subscriptionStatus = 'active';
    organization.subscriptionPlan = data.subscriptionPlan;
    organization.subscriptionExpiry = data.subscriptionExpiry;
    organization.maxStudents = resolvedMaxStudents;
    organization.planSeatLimits = hasMixedSeatAllocation
      ? normalizedPlanAllocations
      : { Silver: 0, Gold: 0, Diamond: 0 };
    // Store per-plan expiry dates if provided
    if (data.planExpiryDates) {
      organization.planExpiryDates = {
        Silver: data.planExpiryDates.Silver,
        Gold: data.planExpiryDates.Gold,
        Diamond: data.planExpiryDates.Diamond,
      };
    }
    await organization.save();

    if (hasMixedSeatAllocation && !hadMixedSeatAllocation) {
      const fallbackPlan =
        previousSubscriptionStatus === 'active' &&
          ['Silver', 'Gold', 'Diamond'].includes(previousSubscriptionPlan || '')
          ? previousSubscriptionPlan as StudentPlan
          : this.getSingleAllocatedPlan(normalizedPlanAllocations);

      await this.backfillLegacyStudentPlans(organizationId, organization, fallbackPlan);
    }

    const remainingSeats = resolvedMaxStudents > 0
      ? Math.max(resolvedMaxStudents - currentStudents, 0)
      : null;

    return {
      message: `Subscription activated for ${organization.organizationName}`,
      organization: {
        id: organization._id,
        organizationName: organization.organizationName,
        subscriptionStatus: organization.subscriptionStatus,
        subscriptionPlan: organization.subscriptionPlan,
        subscriptionExpiry: organization.subscriptionExpiry,
        maxStudents: organization.maxStudents,
        planSeatLimits: organization.planSeatLimits || { Silver: 0, Gold: 0, Diamond: 0 },
        planExpiryDates: organization.planExpiryDates || {},
        usedSeats: currentStudents,
        remainingSeats,
        isUnlimited: resolvedMaxStudents === 0
      }
    };
  }

  // Deactivate Organization Subscription (for platform admin)
  async deactivateOrgSubscription(organizationId: string) {
    const organization = await OrganizationModel.findById(organizationId);
    if (!organization) throw new Error('Organization not found');

    organization.subscriptionStatus = 'inactive';
    organization.subscriptionPlan = 'Free';
    organization.subscriptionExpiry = undefined;
    organization.planSeatLimits = { Silver: 0, Gold: 0, Diamond: 0 };
    await organization.save();

    await UserModel.updateMany(
      {
        organization: organizationId,
        organizationApprovalStatus: 'approved',
        isDeleted: false,
        isOnTrial: { $ne: true },
        subscriptionId: null,
        subscriptionExpiry: null
      },
      {
        $set: {
          currentPlan: 'Free',
          subscriptionStatus: 'expired'
        },
        $unset: {
          subscriptionExpiry: ""
        }
      }
    );

    return {
      message: `Subscription deactivated for ${organization.organizationName}`,
      organization: {
        id: organization._id,
        organizationName: organization.organizationName,
        subscriptionStatus: organization.subscriptionStatus
      }
    };
  }

  // Toggle Organization Active Status (for platform admin)
  async toggleOrganizationActive(organizationId: string) {
    const organization = await OrganizationModel.findById(organizationId);
    if (!organization) throw new Error('Organization not found');

    const validPlans = ['Free', 'Silver', 'Gold', 'Diamond'];
    if (organization.subscriptionPlan && !validPlans.includes(organization.subscriptionPlan)) {
      // @ts-ignore
      organization.subscriptionPlan = 'Free'; // Fix legacy data before save
    }

    organization.isActive = !organization.isActive;
    await organization.save();

    return organization;
  }
}
