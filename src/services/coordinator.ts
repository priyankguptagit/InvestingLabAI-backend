import { DepartmentCoordinatorModel, IDepartmentCoordinator } from "../models/departmentCoordinator";
import { UserModel } from "../models/user";
import { DepartmentModel } from "../models/department";
import { OrganizationModel } from "../models/organization";
import PortfolioHolding from "../models/portfolio";
import { PaperTradeModel } from "../models/paperTrade";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ENV } from "../config/env";
import {
  sendCoordinatorInviteEmail,
  sendStudentApprovalEmail,
  sendStudentRejectionEmail
} from "./email";
import aiChatbotService from "./aiChatbot";
import {
  buildStudentPlanFields,
  extractStudentPlanFromCsvRow,
  normalizeStudentPlan,
  StudentPlan,
} from "../utils/studentPlan";
import { getEffectivePlan } from "../utils/getEffectivePlan";


export class CoordinatorService {

  // Create Coordinator (by Organization Admin)
  async createCoordinator(data: {
    organizationId: string;
    departmentId: string;
    name: string;
    email: string;
    mobile: string;
    designation: 'hod' | 'faculty' | 'coordinator' | 'other';
  }) {
    // Check if email already exists
    const existingCoordinator = await DepartmentCoordinatorModel.findOne({ email: data.email });
    if (existingCoordinator) {
      throw new Error("Coordinator with this email already exists");
    }

    // Verify department belongs to organization
    const department = await DepartmentModel.findOne({
      _id: data.departmentId,
      organization: data.organizationId
    });

    if (!department) {
      throw new Error("Department not found or doesn't belong to this organization");
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");

    const coordinator = await DepartmentCoordinatorModel.create({
      organization: data.organizationId,
      department: data.departmentId,
      name: data.name,
      email: data.email,
      mobile: data.mobile,
      designation: data.designation,
      verificationToken,
      isVerified: false
    });

    // Send invite email
    await sendCoordinatorInviteEmail(data.email, data.name, verificationToken, department.departmentName);

    // Update department stats
    await this.updateDepartmentStats(data.departmentId);

    return {
      message: "Coordinator invited successfully. Verification email sent.",
      coordinatorId: coordinator._id
    };
  }

  // Verify Coordinator Email & Set Password
  async verify(token: string, password: string) {
    const coordinator = await DepartmentCoordinatorModel.findOne({ verificationToken: token })
      .select("+verificationToken");

    if (!coordinator) {
      throw new Error("Invalid or expired verification token");
    }

    const hashedPassword = await argon2.hash(password);

    coordinator.passwordHash = hashedPassword;
    coordinator.isVerified = true;
    coordinator.verificationToken = undefined;
    await coordinator.save();

    const accessToken = this.generateAccessToken(coordinator);
    const refreshToken = this.generateRefreshToken(coordinator);

    return {
      coordinator: this.sanitizeCoordinator(coordinator),
      accessToken,
      refreshToken
    };
  }

  // Login Coordinator
  async login(email: string, password: string, rememberMe: boolean = false) {
    const coordinator = await DepartmentCoordinatorModel.findOne({ email })
      .select("+passwordHash");

    if (!coordinator) {
      throw new Error("Invalid email or password");
    }

    if (!coordinator.isVerified) {
      throw new Error("Please verify your email first");
    }

    if (!coordinator.isActive) {
      throw new Error("Your account has been deactivated");
    }

    if (coordinator.isDeleted) {
      throw new Error("Your account has been removed. Contact organization admin.");
    }

    const isPasswordValid = await argon2.verify(coordinator.passwordHash!, password);
    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    coordinator.lastLogin = new Date();
    coordinator.lastActive = new Date();
    await coordinator.save();

    const accessToken = this.generateAccessToken(coordinator);
    const refreshToken = this.generateRefreshToken(coordinator, rememberMe);

    return {
      coordinator: this.sanitizeCoordinator(coordinator),
      accessToken,
      refreshToken
    };
  }

  async refreshToken(token: string) {
    try {
      const decoded = jwt.verify(token, ENV.JWT_REFRESH_SECRET) as any;
      const coordinator = await DepartmentCoordinatorModel.findById(decoded.id);

      if (!coordinator) {
        throw new Error("Coordinator associated with token no longer exists");
      }

      if (!coordinator.isVerified) {
        throw new Error("Please verify your email first");
      }

      if (!coordinator.isActive) {
        throw new Error("Your account has been deactivated");
      }

      if (coordinator.isDeleted) {
        throw new Error("Your account has been removed. Contact organization admin.");
      }

      const rememberMe = Boolean(decoded.rememberMe);
      const accessToken = this.generateAccessToken(coordinator);
      const refreshToken = this.generateRefreshToken(coordinator, rememberMe);

      return { accessToken, refreshToken, rememberMe };
    } catch (error) {
      throw new Error("Invalid or expired refresh token");
    }
  }

  // Get Coordinator Profile
  async getCoordinatorById(coordinatorId: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId)
      .populate('organization', 'organizationName subscriptionStatus subscriptionPlan subscriptionExpiry planSeatLimits')
      .populate('department', 'departmentName departmentCode');

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    return this.sanitizeCoordinator(coordinator);
  }

  // Update Coordinator Profile
  async updateCoordinatorProfile(coordinatorId: string, updateData: {
    name?: string;
    mobile?: string;
    profilePhoto?: string;
    bio?: string;
  }) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);
    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    if (updateData.name !== undefined) coordinator.name = updateData.name;
    if (updateData.mobile !== undefined) coordinator.mobile = updateData.mobile;
    if (updateData.profilePhoto !== undefined) coordinator.profilePhoto = updateData.profilePhoto;
    if (updateData.bio !== undefined) coordinator.bio = updateData.bio;

    await coordinator.save();

    // Re-fetch with populated fields
    const updated = await DepartmentCoordinatorModel.findById(coordinatorId)
      .populate('organization', 'organizationName subscriptionStatus subscriptionPlan subscriptionExpiry planSeatLimits')
      .populate('department', 'departmentName departmentCode');

    return { coordinator: this.sanitizeCoordinator(updated!) };
  }

  // Get Students in Coordinator's Department
  async getMyDepartmentStudents(coordinatorId: string, status?: string, includePortfolio: boolean = false, plan?: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    const filter: any = {
      department: coordinator.department,
      isDeleted: false
    };

    if (status && status !== "all") {
      const allowedStatuses = ["pending", "approved", "rejected"];
      if (!allowedStatuses.includes(status)) {
        throw new Error("Invalid status filter");
      }
      filter.organizationApprovalStatus = status;
    }

    const organization = await OrganizationModel.findById(coordinator.organization)
      .select("subscriptionStatus subscriptionPlan subscriptionExpiry planSeatLimits");

    let students = await UserModel.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();

    students = students.map((student: any) => ({
      ...student,
      currentPlan: getEffectivePlan(student as any, organization),
    }));

    // Filter by plan if provided
    if (plan && plan !== 'all') {
      const allowedPlans = ['Free', 'Silver', 'Gold', 'Diamond'];
      if (!allowedPlans.includes(plan)) {
        throw new Error('Invalid plan filter');
      }
      students = students.filter((s: any) => s.currentPlan === plan);
    }

    if (includePortfolio) {
      const studentIds = students.map(s => s._id.toString());
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
      students = students.map((student: any) => {
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

        return {
          ...student,
          portfolioSummary: {
            totalInvested,
            currentValue,
            totalPL,
            totalPLPercent: parseFloat(totalPLPercent.toFixed(2)),
            unrealizedPL,
            realizedPL: student.totalPaperPL || 0,
            portfolioAllocation: allocation,
            portfolioTurnover: student.portfolioTurnover || 0,
            maxDrawdown: student.maxDrawdown || 0
          }
        };
      });
    }

    return students;
  }

  // Get Pending Approvals in Department
  async getPendingStudents(coordinatorId: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    const students = await UserModel.find({
      department: coordinator.department,
      organizationApprovalStatus: 'pending',
      isDeleted: false
    }).select('-passwordHash');

    return students;
  }

  // Approve Student
  async approveStudent(coordinatorId: string, studentId: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
    }

    if (student.organizationApprovalStatus === 'approved') {
      throw new Error("Student is already approved");
    }

    student.organizationApprovalStatus = 'approved';
    student.ApprovedBy = coordinatorId as any;
    student.approvedByType = 'department_coordinator';
    student.ApprovedAt = new Date();
    await student.save();

    // Update department stats
    await this.updateDepartmentStats(coordinator.department.toString());

    // Send approval email
    await sendStudentApprovalEmail(student.email, student.name);

    return { message: "Student approved successfully" };
  }

  // Reject Student
  async rejectStudent(coordinatorId: string, studentId: string, reason?: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
    }

    student.organizationApprovalStatus = 'rejected';
    student.RejectedReason = reason || 'No reason provided';
    await student.save();

    // Update department stats
    await this.updateDepartmentStats(coordinator.department.toString());

    // Send rejection email
    await sendStudentRejectionEmail(student.email, student.name, reason);

    return { message: "Student rejected" };
  }

  // Add Student Directly (No Approval Needed)
  async addStudentDirectly(coordinatorId: string, studentData: {
    name: string;
    email: string;
    plan?: StudentPlan;
  }) {
    // Get coordinator details
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    if (!coordinator.isActive || !coordinator.isVerified) {
      throw new Error("Coordinator account is not active");
    }

    const organization = await OrganizationModel.findById(coordinator.organization).select("maxStudents planSeatLimits subscriptionStatus subscriptionExpiry");
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
        organization: coordinator.organization,
        isDeleted: false
      });

      if (currentSeats >= seatLimit) {
        throw new Error(`Student limit reached for this organization (${currentSeats}/${seatLimit})`);
      }
    }

    const normalizedEmail = studentData.email.trim().toLowerCase();
    const assignedPlan = normalizeStudentPlan(studentData.plan || "Free");
    this.assertOrganizationCanAssignPaidPlan(organization, assignedPlan);

    // Check if email already exists
    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new Error("A user with this email already exists");
    }

    if (assignedPlan !== "Free" && hasMixedSeatAllocation) {
      const limitForPlan = configuredPlanSeats[assignedPlan];
      if (limitForPlan <= 0) {
        throw new Error(`${assignedPlan} seat is not enabled for this organization`);
      }

      const usedPlanSeats = await UserModel.countDocuments({
        organization: coordinator.organization,
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
      organization: coordinator.organization,
      department: coordinator.department,
      organizationApprovalStatus: "approved", // Pre-approved
      ApprovedBy: coordinatorId as any,
      approvedByType: "department_coordinator",
      ApprovedAt: new Date(),
      isVerified: false, // Still needs to set password
      verificationToken,
      isActive: true,
      ...buildStudentPlanFields(assignedPlan)
    });

    // Send verification email
    const { sendVerificationEmail } = await import("./email");
    await sendVerificationEmail(normalizedEmail, verificationToken);

    // Update department stats
    await this.updateDepartmentStats(coordinator.department.toString());

    return {
      message: "Student added successfully. Verification email sent.",
      studentId: student._id
    };
  }

  // Import Students from CSV (Bulk Addition)
  async importStudentsFromCSV(coordinatorId: string, csvData: Array<Record<string, any> & {
    name: string;
    email: string;
    organization?: string;
    department?: string;
    plan?: string;
  }>) {
    // Get coordinator details
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId)
      .populate("department", "departmentName departmentCode");

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    if (!coordinator.isActive || !coordinator.isVerified) {
      throw new Error("Coordinator account is not active");
    }

    const organization = await OrganizationModel.findById(coordinator.organization).select("maxStudents planSeatLimits subscriptionStatus subscriptionExpiry");
    if (!organization) {
      throw new Error("Organization not found");
    }

    const configuredPlanSeats = organization.planSeatLimits || { Silver: 0, Gold: 0, Diamond: 0 };
    const hasMixedSeatAllocation =
      configuredPlanSeats.Silver > 0 ||
      configuredPlanSeats.Gold > 0 ||
      configuredPlanSeats.Diamond > 0;

    const seatLimit = organization.maxStudents || 0;
    const existingSeats = !hasMixedSeatAllocation && seatLimit > 0
      ? await UserModel.countDocuments({ organization: coordinator.organization, isDeleted: false })
      : 0;
    let seatsConsumedInBatch = 0;

    const existingPaidPlanUsage = hasMixedSeatAllocation
      ? {
        Silver: await UserModel.countDocuments({ organization: coordinator.organization, isDeleted: false, currentPlan: "Silver" }),
        Gold: await UserModel.countDocuments({ organization: coordinator.organization, isDeleted: false, currentPlan: "Gold" }),
        Diamond: await UserModel.countDocuments({ organization: coordinator.organization, isDeleted: false, currentPlan: "Diamond" }),
      }
      : { Silver: 0, Gold: 0, Diamond: 0 };

    const addedPaidPlanUsage = { Silver: 0, Gold: 0, Diamond: 0 };

    const results = {
      added: [] as Array<{ name: string; email: string; plan: string }>,
      skipped: [] as Array<{ name: string; email: string; reason: string }>,
      errors: [] as Array<{ row: number; name: string; email: string; error: string }>
    };

    // Get department info for validation
    const department = coordinator.department as any;
    const departmentName = String(department.departmentName || "").toLowerCase();
    const departmentCode = String(department.departmentCode || "").toLowerCase();

    const seenEmails = new Set<string>();

    // Process each row
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];

      try {
        // Validate required fields
        if (!row.name || !row.email) {
          results.errors.push({
            row: i + 1,
            name: row.name || "",
            email: row.email || "",
            error: "Missing required fields (name or email)"
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
            error: "Invalid email format"
          });
          continue;
        }

        // Check if department field exists and validate
        if (row.department) {
          const rowDept = String(row.department).trim().toLowerCase();
          // Check if it matches coordinator's department (by name or code)
          if (rowDept !== departmentName && rowDept !== departmentCode) {
            results.skipped.push({
              name: row.name,
              email: row.email,
              reason: `Department mismatch: "${row.department}" does not match your department "${department.departmentName}"`
            });
            continue;
          }
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
            reason: "Email already exists in system"
          });
          continue;
        }

        // Check for duplicate within this CSV batch
        if (seenEmails.has(normalizedEmail)) {
          results.skipped.push({
            name: row.name,
            email: row.email,
            reason: "Duplicate email in CSV file"
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
          organization: coordinator.organization,
          department: coordinator.department,
          organizationApprovalStatus: "approved", // Pre-approved
          ApprovedBy: coordinatorId as any,
          approvedByType: "department_coordinator",
          ApprovedAt: new Date(),
          isVerified: false,
          verificationToken,
          isActive: true,
          ...buildStudentPlanFields(assignedPlan)
        });

        // Send verification email
        const { sendVerificationEmail } = await import("./email");
        await sendVerificationEmail(normalizedEmail, verificationToken);

        seenEmails.add(normalizedEmail);
        seatsConsumedInBatch += 1;

        if (assignedPlan !== "Free" && hasMixedSeatAllocation) {
          addedPaidPlanUsage[assignedPlan] += 1;
        }

        results.added.push({
          name: row.name,
          email: normalizedEmail,
          plan: assignedPlan
        });

      } catch (error: any) {
        results.errors.push({
          row: i + 1,
          name: row.name || "",
          email: row.email || "",
          error: error.message || "Unknown error"
        });
      }
    }

    // Update department stats if any students were added
    if (results.added.length > 0) {
      await this.updateDepartmentStats(coordinator.department.toString());
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

  // Get Student by ID (Department Restricted)

  // Get Student by ID (Department Restricted)
  async getStudentById(coordinatorId: string, studentId: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    const organization = await OrganizationModel.findById(coordinator.organization)
      .select("subscriptionStatus subscriptionPlan subscriptionExpiry planSeatLimits");
    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department,
      isDeleted: false
    })
      .populate('department', 'departmentName departmentCode')
      .select('-passwordHash');

    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
    }

    const studentObject = student.toObject();
    return {
      ...studentObject,
      currentPlan: getEffectivePlan(studentObject as any, organization),
    };
  }

  // Update Student (Department Restricted - Cannot change department)
  async updateStudent(coordinatorId: string, studentId: string, updateData: {
    name?: string;
    email?: string;
    plan?: StudentPlan;
  }) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department,
      isDeleted: false
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
    }

    // If updating email, check for duplicates
    if (updateData.email && updateData.email !== student.email) {
      const existingUser = await UserModel.findOne({ email: updateData.email });
      if (existingUser) {
        throw new Error("A user with this email already exists");
      }
    }

    // Update fields (coordinators cannot change department)
    if (updateData.name) student.name = updateData.name;
    if (updateData.email) student.email = updateData.email;
    if (updateData.plan !== undefined) {
      const nextPlan = normalizeStudentPlan(updateData.plan);

      if (nextPlan !== student.currentPlan) {
        const organization = await OrganizationModel.findById(coordinator.organization).select("planSeatLimits subscriptionStatus subscriptionExpiry");
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
            organization: coordinator.organization,
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

    const organization = await OrganizationModel.findById(coordinator.organization)
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

  // Archive Student (Department Restricted)
  async archiveStudent(coordinatorId: string, studentId: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department,
      isDeleted: false
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
    }

    if (student.isDeleted) {
      throw new Error("Student is already archived");
    }

    // Soft delete
    student.isDeleted = true;
    student.deletedAt = new Date();
    student.isActive = false;
    await student.save();

    // Update department stats
    await this.updateDepartmentStats(coordinator.department.toString());

    return {
      message: "Student archived successfully"
    };
  }

  // Unarchive Student (Department Restricted)
  async unarchiveStudent(coordinatorId: string, studentId: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    // Find student in department (even if deleted)
    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
    }

    if (!student.isDeleted) {
      throw new Error("Student is not archived");
    }

    // Restore
    student.isDeleted = false;
    student.deletedAt = undefined;
    student.isActive = true;
    await student.save();

    // Update department stats
    await this.updateDepartmentStats(coordinator.department.toString());

    return {
      message: "Student unarchived successfully"
    };
  }

  // Get Student Portfolio (Department Restricted)
  async getStudentPortfolio(coordinatorId: string, studentId: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);

    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    // Verify student belongs to coordinator's department
    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department,
      isDeleted: false
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
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


  // Reconcile All Students — Generate AI Portfolio Reports
  async reconcileStudents(coordinatorId: string, authToken: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);
    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    const organization = await OrganizationModel.findById(coordinator.organization).select("subscriptionStatus subscriptionExpiry");
    this.assertOrganizationPremiumActive(organization, "AI reconciliation");

    // Get all non-deleted students in the department
    const students = await UserModel.find({
      department: coordinator.department,
      isDeleted: false,
      organizationApprovalStatus: 'approved'
    }).select('_id name email');

    if (students.length === 0) {
      return { processed: 0, total: 0, message: "No students found in your department" };
    }

    let processed = 0;
    const errors: string[] = [];

    // Process students sequentially to avoid overwhelming the AI endpoint
    for (const student of students) {
      try {
        // Fetch the student's portfolio directly
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

          // Call the dedicated portfolio report generator (calls Gemini directly, no auth/history issues)
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

  // Get Student Report (Department Restricted)
  async getStudentReport(coordinatorId: string, studentId: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);
    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department,
      isDeleted: false
    }).select('name email portfolioReport');

    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
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
  async submitTeacherReview(coordinatorId: string, studentId: string, reviewData: {
    factor1Rating: number;
    factor2Rating: number;
    factor3Rating: number;
    suggestions?: string;
  }) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);
    if (!coordinator) {
      throw new Error('Coordinator not found');
    }

    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department,
      isDeleted: false
    });

    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
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

    // Aggregate score: average of 3 ratings scaled to 100
    const avg = (reviewData.factor1Rating + reviewData.factor2Rating + reviewData.factor3Rating) / 3;
    const aggregateScore = parseFloat((avg * 20).toFixed(1));

    await UserModel.updateOne(
      { _id: studentId },
      {
        $set: {
          teacherReview: {
            factor1Rating: reviewData.factor1Rating,
            factor2Rating: reviewData.factor2Rating,
            factor3Rating: reviewData.factor3Rating,
            aggregateScore,
            suggestions: reviewData.suggestions || '',
            reviewedAt: new Date(),
            reviewedBy: coordinatorId as any
          }
        }
      }
    );

    return {
      message: 'Review submitted successfully',
      aggregateScore
    };
  }

  // Bulk Archive Students (Department Restricted)
  async bulkArchiveStudents(coordinatorId: string, studentIds: string[]) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);
    if (!coordinator) throw new Error("Coordinator not found");

    const result = await UserModel.updateMany(
      { _id: { $in: studentIds }, department: coordinator.department, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), isActive: false } }
    );

    await this.updateDepartmentStats(coordinator.department.toString());

    return { message: `${result.modifiedCount} student(s) archived successfully`, modifiedCount: result.modifiedCount };
  }

  // Bulk Unarchive Students (Department Restricted)
  async bulkUnarchiveStudents(coordinatorId: string, studentIds: string[]) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);
    if (!coordinator) throw new Error("Coordinator not found");

    const result = await UserModel.updateMany(
      { _id: { $in: studentIds }, department: coordinator.department, isDeleted: true },
      { $set: { isDeleted: false, isActive: true }, $unset: { deletedAt: 1 } }
    );

    await this.updateDepartmentStats(coordinator.department.toString());

    return { message: `${result.modifiedCount} student(s) unarchived successfully`, modifiedCount: result.modifiedCount };
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
  private generateAccessToken(coordinator: IDepartmentCoordinator) {
    return jwt.sign(
      {
        id: coordinator._id,
        email: coordinator.email,
        role: 'department_coordinator',
        name: coordinator.name,
        department: coordinator.department,
        organization: coordinator.organization,
        isActive: coordinator.isActive
      },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN as any }
    );
  }

  private generateRefreshToken(coordinator: IDepartmentCoordinator, rememberMe: boolean = false) {
    return jwt.sign(
      { id: coordinator._id, rememberMe },
      ENV.JWT_REFRESH_SECRET,
      { expiresIn: rememberMe ? "30d" : ENV.JWT_REFRESH_EXPIRES_IN as any }
    );
  }

  private isOrganizationPremiumActive(organization: { subscriptionStatus?: string; subscriptionExpiry?: Date } | null) {
    return !!organization &&
      organization.subscriptionStatus === 'active' &&
      (!organization.subscriptionExpiry || new Date(organization.subscriptionExpiry) > new Date());
  }

  private assertOrganizationPremiumActive(
    organization: { subscriptionStatus?: string; subscriptionExpiry?: Date } | null,
    featureName: string
  ) {
    if (!this.isOrganizationPremiumActive(organization)) {
      throw new Error(`${featureName} is unavailable because this organization's subscription is inactive or expired.`);
    }
  }

  private assertOrganizationCanAssignPaidPlan(
    organization: { subscriptionStatus?: string; subscriptionExpiry?: Date } | null,
    plan: StudentPlan
  ) {
    if (plan !== 'Free') {
      this.assertOrganizationPremiumActive(organization, "Paid student plan assignment");
    }
  }

  private sanitizeCoordinator(coordinator: any) {
    const rawOrganization = coordinator.organization && typeof coordinator.organization === 'object'
      ? (coordinator.organization.toObject?.() ?? coordinator.organization)
      : coordinator.organization;

    const organization = coordinator.organization && typeof coordinator.organization === 'object'
      ? {
        ...rawOrganization,
        planSeatLimits: {
          Silver: rawOrganization.planSeatLimits?.Silver || 0,
          Gold: rawOrganization.planSeatLimits?.Gold || 0,
          Diamond: rawOrganization.planSeatLimits?.Diamond || 0,
        },
      }
      : coordinator.organization;

    return {
      id: coordinator._id,
      name: coordinator.name,
      email: coordinator.email,
      mobile: coordinator.mobile,
      profilePhoto: coordinator.profilePhoto,
      bio: coordinator.bio,
      designation: coordinator.designation,
      role: coordinator.role,
      organization,
      department: coordinator.department,
      isVerified: coordinator.isVerified,
      isActive: coordinator.isActive,
      lastLogin: coordinator.lastLogin,
      createdAt: coordinator.createdAt,
    };
  }

  // Delete Coordinator (by Org Admin)
  async deleteCoordinator(coordinatorId: string, organizationId: string) {
    const coordinator = await DepartmentCoordinatorModel.findOne({
      _id: coordinatorId,
      organization: organizationId
    });

    if (!coordinator) {
      throw new Error("Coordinator not found or doesn't belong to your organization");
    }

    coordinator.isDeleted = true;
    coordinator.deletedAt = new Date();
    await coordinator.save();

    // Update department stats
    await this.updateDepartmentStats(coordinator.department.toString());

    return { message: "Coordinator removed successfully" };
  }

  // Get All Coordinators by Organization (for Org Admin)
  async getCoordinatorsByOrganization(organizationId: string) {
    const coordinators = await DepartmentCoordinatorModel.find({
      organization: organizationId,
      isDeleted: false
    })
      .populate('department', 'departmentName departmentCode')
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    return coordinators;
  }

  // ============================================
  // Get Student Portfolio Metrics (for Accordion)
  // ============================================
  async getStudentPortfolioMetrics(coordinatorId: string, studentId: string) {
    const coordinator = await DepartmentCoordinatorModel.findById(coordinatorId);
    if (!coordinator) {
      throw new Error("Coordinator not found");
    }

    // Verify student belongs to coordinator's department
    const student = await UserModel.findOne({
      _id: studentId,
      department: coordinator.department,
      isDeleted: false
    });
    if (!student) {
      throw new Error("Student not found or doesn't belong to your department");
    }

    // ── 1. Fetch open holdings ──
    const holdings = await PortfolioHolding.find({ userId: studentId }).lean();

    // ── 2. Core Valuations ──
    const totalInvestedValue = holdings.reduce((sum, h) => sum + (h.totalInvested || 0), 0);
    const holdingsCurrentValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    const currentPortfolioValue = (student.virtualBalance || 0) + holdingsCurrentValue;
    const initialBalance = student.initialVirtualBalance || 100000;
    const absoluteROI = currentPortfolioValue - initialBalance;
    const percentageROI = initialBalance > 0 ? parseFloat(((absoluteROI / initialBalance) * 100).toFixed(2)) : 0;

    // ── 3. Profit & Loss ──
    // Realized P&L: aggregate from all EXECUTED SELL trades
    const realizedAgg = await PaperTradeModel.aggregate([
      { $match: { userId: student._id, type: 'SELL', status: 'EXECUTED' } },
      { $group: { _id: null, totalRealizedPL: { $sum: { $ifNull: ['$realizedPL', 0] } } } }
    ]);
    const realizedPL = realizedAgg.length > 0 ? realizedAgg[0].totalRealizedPL : 0;

    // Unrealized P&L: sum from open holdings
    const unrealizedPL = holdings.reduce((sum, h) => sum + (h.unrealizedPL || 0), 0);

    // ── 4. Activity & Risk Metrics ──
    // Trade Volume: count all executed orders (buy + sell)
    const tradeVolume = await PaperTradeModel.countDocuments({
      userId: student._id,
      status: 'EXECUTED'
    });

    // Turnover Rate: (total sold value in last 30 days) / currentPortfolioValue * 100
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const turnoverAgg = await PaperTradeModel.aggregate([
      {
        $match: {
          userId: student._id,
          type: 'SELL',
          status: 'EXECUTED',
          executedAt: { $gte: thirtyDaysAgo }
        }
      },
      { $group: { _id: null, totalSoldValue: { $sum: '$totalAmount' } } }
    ]);
    const totalSoldValue30d = turnoverAgg.length > 0 ? turnoverAgg[0].totalSoldValue : 0;
    const turnoverRate = currentPortfolioValue > 0
      ? parseFloat(((totalSoldValue30d / currentPortfolioValue) * 100).toFixed(2))
      : 0;

    // Max Drawdown: read from user record
    // TODO: For true max drawdown, create a `PortfolioSnapshot` schema with daily
    // { userId, date, totalValue } records. Then calculate drawdown as the largest
    // peak-to-trough percentage drop. For now we use the stored value.
    const maxDrawdown = student.maxDrawdown || 0;

    // ── 5. Portfolio Allocation (% by category) ──
    const allocationByCategory: Record<string, number> = {};
    for (const h of holdings) {
      const cat = h.category || 'OTHER';
      allocationByCategory[cat] = (allocationByCategory[cat] || 0) + (h.totalInvested || 0);
    }

    const portfolioAllocation: Record<string, number> = {};
    if (totalInvestedValue > 0) {
      for (const [cat, amount] of Object.entries(allocationByCategory)) {
        portfolioAllocation[cat] = parseFloat(((amount / totalInvestedValue) * 100).toFixed(1));
      }
    }

    return {
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        tradingLevel: student.tradingLevel || 'BEGINNER'
      },
      coreValuations: {
        totalInvestedValue: parseFloat(totalInvestedValue.toFixed(2)),
        currentPortfolioValue: parseFloat(currentPortfolioValue.toFixed(2)),
        cashBalance: parseFloat((student.virtualBalance || 0).toFixed(2)),
        absoluteROI: parseFloat(absoluteROI.toFixed(2)),
        percentageROI
      },
      profitLoss: {
        realizedPL: parseFloat(realizedPL.toFixed(2)),
        unrealizedPL: parseFloat(unrealizedPL.toFixed(2)),
        totalPL: parseFloat((realizedPL + unrealizedPL).toFixed(2))
      },
      activityRisk: {
        tradeVolume,
        turnoverRate,
        maxDrawdown
      },
      portfolioAllocation
    };
  }
}
