import { Request, Response } from "express";
import { DepartmentService } from "../services/department";
import { asyncHandler } from "../common/errors/errorHandler";
import { z } from "zod";

const departmentService = new DepartmentService();

const createDepartmentSchema = z.object({
  departmentName: z.string().min(2, "Department name is required"),
  departmentCode: z.string().min(2, "Department code is required"),
  description: z.string().optional()
});

const updateDepartmentSchema = z.object({
  departmentName: z.string().min(2).optional(),
  departmentCode: z.string().min(2).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional()
});

export class DepartmentController {
  
  // Create Department (Organization Admin only)
  createDepartment = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    const data = createDepartmentSchema.parse(req.body);
    
    const department = await departmentService.createDepartment(organizationId, data);
    res.status(201).json({ 
      success: true, 
      message: "Department created successfully",
      department 
    });
  });

  // Get All Departments in Organization
  getDepartments = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization;
    
    const departments = await departmentService.getDepartmentsByOrganization(organizationId);
    res.status(200).json({ 
      success: true, 
      departments,
      count: departments.length 
    });
  });

  // Get Department by ID
  getDepartmentById = asyncHandler(async (req: Request, res: Response) => {
    const departmentId = req.params.id as string;
    
    const department = await departmentService.getDepartmentById(departmentId);
    res.status(200).json({ success: true, department });
  });

  // Get Department Details with Stats
  getDepartmentDetails = asyncHandler(async (req: Request, res: Response) => {
    const departmentId = req.params.id as string;
    
    const details = await departmentService.getDepartmentDetails(departmentId);
    res.status(200).json({ success: true, ...details });
  });

  // Update Department
  updateDepartment = asyncHandler(async (req: Request, res: Response) => {
    const departmentId = req.params.id as string;
    const updates = updateDepartmentSchema.parse(req.body);
    
    const department = await departmentService.updateDepartment(departmentId, updates);
    res.status(200).json({ 
      success: true, 
      message: "Department updated successfully",
      department 
    });
  });

  // Delete Department
  deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
    const departmentId = req.params.id as string;
    
    const result = await departmentService.deleteDepartment(departmentId);
    res.status(200).json({ success: true, ...result });
  });

  // Get Public Department List (for registration)
  getPublicDepartments = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.params.organizationId as string;
    
    const departments = await departmentService.getPublicDepartmentsByOrganization(organizationId);
    res.status(200).json({ success: true, departments });
  });
}
