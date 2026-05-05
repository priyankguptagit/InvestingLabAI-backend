import { DepartmentModel, IDepartment } from "../models/department";
import { UserModel } from "../models/user";
import { DepartmentCoordinatorModel } from "../models/departmentCoordinator";
import { OrganizationModel } from "../models/organization";

export class DepartmentService {

  // Create Department (by Organization Admin)
  async createDepartment(organizationId: string, data: {
    departmentName: string;
    departmentCode: string;
    description?: string;
  }) {
    // Check if department code already exists in this organization
    const existingDept = await DepartmentModel.findOne({
      organization: organizationId,
      departmentCode: data.departmentCode.toUpperCase()
    });

    if (existingDept) {
      throw new Error("Department with this code already exists in your organization");
    }

    const department = await DepartmentModel.create({
      organization: organizationId,
      departmentName: data.departmentName,
      departmentCode: data.departmentCode.toUpperCase(),
      description: data.description
    });

    // Update organization stats
    await this.updateOrganizationStats(organizationId);

    return department;
  }

  // Get All Departments by Organization
  async getDepartmentsByOrganization(organizationId: string) {
    const departments = await DepartmentModel.find({
      organization: organizationId,
      isDeleted: false
    }).sort({ departmentName: 1 });

    // Auto-calculate stats correctly mapping to frontend expectations
    const departmentsWithCounts = await Promise.all(departments.map(async (dept) => {
      const studentCount = await UserModel.countDocuments({
        department: dept._id,
        isDeleted: false
      });
      const coordinatorCount = await DepartmentCoordinatorModel.countDocuments({
        department: dept._id,
        isDeleted: false,
        isActive: true
      });

      // We can also sync the stats while we're here
      if (dept.totalStudents !== studentCount || dept.totalCoordinators !== coordinatorCount) {
        dept.totalStudents = studentCount;
        dept.totalCoordinators = coordinatorCount;
        await dept.save();
      }

      return {
        ...dept.toObject(),
        studentCount,
        coordinatorCount
      };
    }));

    return departmentsWithCounts;
  }

  // Get Department by ID
  async getDepartmentById(departmentId: string) {
    const department = await DepartmentModel.findById(departmentId)
      .populate('organization', 'organizationName')
      .lean();

    if (!department) {
      throw new Error("Department not found");
    }

    return department;
  }

  // Get Department Details with Stats
  async getDepartmentDetails(departmentId: string) {
    const department = await DepartmentModel.findById(departmentId);

    if (!department) {
      throw new Error("Department not found");
    }

    // Get coordinators
    const coordinators = await DepartmentCoordinatorModel.find({
      department: departmentId,
      isDeleted: false,
      isActive: true
    }).select('name email designation');

    // Get students
    const students = await UserModel.find({
      department: departmentId,
      isDeleted: false
    }).select('name email organizationApprovalStatus createdAt');

    return {
      department,
      coordinators,
      students,
      stats: {
        totalCoordinators: department.totalCoordinators,
        totalStudents: department.totalStudents,
        activeStudents: department.activeStudents
      }
    };
  }

  // Update Department
  async updateDepartment(departmentId: string, updates: {
    departmentName?: string;
    departmentCode?: string;
    description?: string;
    isActive?: boolean;
  }) {
    const department = await DepartmentModel.findById(departmentId);

    if (!department) {
      throw new Error("Department not found");
    }

    // If updating department code, check uniqueness
    if (updates.departmentCode && updates.departmentCode !== department.departmentCode) {
      const existingDept = await DepartmentModel.findOne({
        organization: department.organization,
        departmentCode: updates.departmentCode.toUpperCase(),
        _id: { $ne: departmentId }
      });

      if (existingDept) {
        throw new Error("Department code already exists in this organization");
      }
    }

    Object.assign(department, updates);
    await department.save();

    return department;
  }

  // Delete Department (Soft Delete)
  async deleteDepartment(departmentId: string) {
    const department = await DepartmentModel.findById(departmentId);

    if (!department) {
      throw new Error("Department not found");
    }

    // Check if there are students in this department
    const studentCount = await UserModel.countDocuments({
      department: departmentId,
      isDeleted: false
    });

    if (studentCount > 0) {
      throw new Error(`Cannot delete department. ${studentCount} students are enrolled. Please reassign them first.`);
    }

    department.isDeleted = true;
    department.deletedAt = new Date();
    await department.save();

    // Update organization stats
    await this.updateOrganizationStats(department.organization.toString());

    return { message: "Department deleted successfully" };
  }

  // Update Department Stats
  async updateDepartmentStats(departmentId: string) {
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

    const totalCoordinators = await DepartmentCoordinatorModel.countDocuments({
      department: departmentId,
      isDeleted: false,
      isActive: true
    });

    await DepartmentModel.findByIdAndUpdate(departmentId, {
      totalStudents,
      activeStudents,
      totalCoordinators
    });
  }

  // Update Organization Stats
  private async updateOrganizationStats(organizationId: string) {
    const totalDepartments = await DepartmentModel.countDocuments({
      organization: organizationId,
      isDeleted: false
    });

    await OrganizationModel.findByIdAndUpdate(organizationId, {
      totalDepartments
    });
  }

  // Get Public Department List (for registration dropdown)
  async getPublicDepartmentsByOrganization(organizationId: string) {
    return await DepartmentModel.find({
      organization: organizationId,
      isActive: true,
      isDeleted: false
    })
      .select('_id departmentName departmentCode')
      .sort({ departmentName: 1 });
  }
}
