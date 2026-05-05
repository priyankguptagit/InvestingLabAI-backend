import { Router } from "express";
import { DepartmentController } from "../controllers/department";
import { authorize } from "../common/guards/role.guard";

const router = Router();
const departmentController = new DepartmentController();

// ============================================
// PUBLIC ROUTES
// ============================================
router.get("/public/:organizationId", departmentController.getPublicDepartments);

// ============================================
// ORGANIZATION ADMIN ROUTES
// ============================================
router.post("/", authorize(["organization_admin"]), departmentController.createDepartment);
router.get("/", authorize(["organization_admin", "department_coordinator"]), departmentController.getDepartments);
router.get("/:id", authorize(["organization_admin", "department_coordinator"]), departmentController.getDepartmentById);
router.get("/:id/details", authorize(["organization_admin", "department_coordinator"]), departmentController.getDepartmentDetails);
router.patch("/:id", authorize(["organization_admin"]), departmentController.updateDepartment);
router.delete("/:id", authorize(["organization_admin"]), departmentController.deleteDepartment);

export default router;
