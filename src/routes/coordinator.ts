import { Router } from "express";
import { CoordinatorController } from "../controllers/coordinator";
import { authorize } from "../common/guards/role.guard";

const router = Router();
const coordinatorController = new CoordinatorController();

// ============================================
// PUBLIC ROUTES
// ============================================
router.post("/verify", coordinatorController.verify);
router.post("/login", coordinatorController.login);
router.post("/logout", coordinatorController.logout);
router.post("/refresh-token", coordinatorController.refreshToken);

// ============================================
// PROTECTED COORDINATOR ROUTES
// ============================================
router.get("/me", authorize(["department_coordinator"]), coordinatorController.getMe);
router.put("/me", authorize(["department_coordinator"]), coordinatorController.updateProfile);
router.get("/students", authorize(["department_coordinator"]), coordinatorController.getMyStudents);
router.get("/students/pending", authorize(["department_coordinator"]), coordinatorController.getPendingStudents);
router.patch("/students/:studentId/approve", authorize(["department_coordinator"]), coordinatorController.approveStudent);
router.patch("/students/:studentId/reject", authorize(["department_coordinator"]), coordinatorController.rejectStudent);

// New Routes: Direct Student Addition & CSV Import
router.post("/students/add", authorize(["department_coordinator"]), coordinatorController.addStudent);
router.post("/students/import-csv", authorize(["department_coordinator"]), coordinatorController.importStudentsCSV);
router.patch("/students/bulk-action", authorize(["department_coordinator"]), coordinatorController.bulkAction);

// New Routes: Student Management (Get, Update, Archive, View Portfolio)
router.get("/students/:studentId", authorize(["department_coordinator"]), coordinatorController.getStudentById);
router.put("/students/:studentId", authorize(["department_coordinator"]), coordinatorController.updateStudent);
router.delete("/students/:studentId", authorize(["department_coordinator"]), coordinatorController.archiveStudent);
router.patch("/students/:studentId/unarchive", authorize(["department_coordinator"]), coordinatorController.unarchiveStudent);
router.get("/students/:studentId/portfolio", authorize(["department_coordinator"]), coordinatorController.getStudentPortfolio);
router.get("/students/:studentId/metrics", authorize(["department_coordinator"]), coordinatorController.getStudentPortfolioMetrics);
router.get("/students/:studentId/report", authorize(["department_coordinator"]), coordinatorController.getStudentReport);
router.post("/students/:studentId/review", authorize(["department_coordinator"]), coordinatorController.submitTeacherReview);
router.post("/reconcile", authorize(["department_coordinator"]), coordinatorController.reconcileStudents);



// ============================================
// ORGANIZATION ADMIN ROUTES (Manage Coordinators)
// ============================================
router.post("/", authorize(["organization_admin"]), coordinatorController.createCoordinator);
router.get("/all", authorize(["organization_admin"]), coordinatorController.getAllCoordinators);
router.delete("/:id", authorize(["organization_admin"]), coordinatorController.deleteCoordinator);

export default router;
