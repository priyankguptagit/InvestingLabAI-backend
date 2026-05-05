import { Router } from "express";
import { UserController } from "../controllers/user";
import { authorize } from "../common/guards/role.guard";

const router = Router();
const userController = new UserController();

// Public Routes
router.post("/register", userController.register);
router.post("/verify", userController.verify);
router.post("/login", userController.login);
router.post("/forgot-password", userController.forgotPassword);
router.post("/reset-password", userController.resetPassword);
router.post("/logout", userController.logout);
router.post("/refresh-token", userController.refreshToken);

// Session Management Routes
router.post("/extend-session", authorize(["user", "admin", "super_admin"]), userController.extendSession);
router.get("/session-status", authorize(["user", "admin", "super_admin"]), userController.getSessionStatus);

// Protected User Routes
router.get("/me", authorize(["user", "admin", "super_admin"]), userController.getMe);
router.get("/my-report", authorize(["user", "admin", "super_admin"]), userController.getMyReport);
router.put("/update-profile", authorize(["user", "admin", "super_admin"]), userController.updateMyProfile);
router.put("/change-password", authorize(["user", "admin", "super_admin"]), userController.changePassword);

// ============================================
// ADMIN ROUTES
// ============================================

router.get("/all", authorize(["admin", "super_admin", "employee"], ["users.view"]), userController.getAllUsers);
router.get("/stats", authorize(["admin", "super_admin", "employee"], ["users.view"]), userController.getUserStats);
router.get("/:id", authorize(["admin", "super_admin", "employee"], ["users.view"]), userController.getUserById);
router.put("/:id", authorize(["admin", "super_admin", "employee"], ["users.edit"]), userController.updateUser);

// Status Management
router.patch("/bulk-action", authorize(["admin", "super_admin", "employee"], ["users.bulk_action"]), userController.bulkAction);
router.patch("/:id/toggle-active", authorize(["admin", "super_admin", "employee"], ["users.block"]), userController.toggleUserActive);

// --- NEW: SOFT DELETE ROUTES ---
router.patch("/:id/soft-delete", authorize(["admin", "super_admin", "employee"], ["users.archive"]), userController.softDeleteUser);
router.patch("/:id/restore", authorize(["admin", "super_admin", "employee"], ["users.restore"]), userController.restoreUser);

// --- NEW: ADMIN PLAN CHANGE (no Razorpay charge — admin override) ---
router.patch("/:id/change-plan", authorize(["admin", "super_admin"]), userController.adminChangePlan);

// Hard Delete (Optional - keep if you still want permanent deletion capability)
router.delete("/:id", authorize(["super_admin", "employee"], ["users.delete"]), userController.deleteUser);


export default router;