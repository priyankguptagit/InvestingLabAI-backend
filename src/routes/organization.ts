import { Router } from "express";
import { OrganizationController } from "../controllers/organization";
import { authorize } from "../common/guards/role.guard";

const router = Router();
const organizationController = new OrganizationController();

// ============================================
// PUBLIC ROUTES
// ============================================
router.get("/public/list", organizationController.getPublicList);
router.post("/register", organizationController.register);
router.post("/verify", organizationController.verify);
router.post("/login", organizationController.login);
router.post("/logout", organizationController.logout);
router.post("/refresh-token", organizationController.refreshToken);

// ============================================
// PROTECTED ORGANIZATION ADMIN ROUTES
// ============================================
router.get("/me", authorize(["organization_admin"]), organizationController.getMe);
router.put("/me", authorize(["organization_admin"]), organizationController.updateProfile);
// Update the Org Admin's personal profile (name + avatar) — isolated from UserModel
router.put("/admin/me", authorize(["organization_admin"]), organizationController.updateAdminProfile);
router.get("/stats", authorize(["organization_admin"]), organizationController.getStats);
router.post("/admins", authorize(["organization_admin"]), organizationController.createAdmin);
router.get("/students/pending", authorize(["organization_admin"]), organizationController.getPendingStudents);
router.get("/students", authorize(["organization_admin"]), organizationController.getStudents);
router.patch("/students/:studentId/approve", authorize(["organization_admin"]), organizationController.approveStudent);
router.patch("/students/:studentId/reject", authorize(["organization_admin"]), organizationController.rejectStudent);

// New Routes: Direct Student Addition & CSV Import (Organization Admin)
router.post("/students/add", authorize(["organization_admin"]), organizationController.addStudent);
router.post("/students/import-csv", authorize(["organization_admin"]), organizationController.importStudentsCSV);
router.patch("/students/bulk-action", authorize(["organization_admin"]), organizationController.bulkAction);

// New Routes: Student Management (Get, Update, Archive, View Portfolio)
router.get("/students/:studentId", authorize(["organization_admin"]), organizationController.getStudentById);
router.put("/students/:studentId", authorize(["organization_admin"]), organizationController.updateStudent);
router.delete("/students/:studentId", authorize(["organization_admin"]), organizationController.archiveStudent);
router.patch("/students/:studentId/unarchive", authorize(["organization_admin"]), organizationController.unarchiveStudent);
router.get("/students/:studentId/portfolio", authorize(["organization_admin"]), organizationController.getStudentPortfolio);

// New Routes: Reconciliation & AI Reports (Organization Admin)
router.post("/students/reconcile", authorize(["organization_admin"]), organizationController.reconcileStudents);
router.get("/students/:studentId/report", authorize(["organization_admin"]), organizationController.getStudentReport);
router.post("/students/:studentId/review", authorize(["organization_admin"]), organizationController.submitTeacherReview);

// ============================================
// PLATFORM ADMIN ROUTES (Manage Organizations)
// ============================================
router.get("/all", authorize(["admin", "super_admin", "employee"], ["orgs.view"]), organizationController.getAllOrganizations);
router.patch("/:id/toggle-active", authorize(["admin", "super_admin", "employee"], ["orgs.deactivate_subscription"]), organizationController.toggleOrganizationActive);

// Organization Subscription Management (manual, by platform admin)
router.patch("/:id/subscription/activate", authorize(["admin", "super_admin", "employee"], ["orgs.activate_subscription"]), organizationController.activateOrgSubscription);
router.patch("/:id/subscription/deactivate", authorize(["admin", "super_admin", "employee"], ["orgs.deactivate_subscription"]), organizationController.deactivateOrgSubscription);

export default router;
