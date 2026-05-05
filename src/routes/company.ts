import { Router } from 'express';
import { CompanyAuthController } from '../controllers/companyAuth';
import { authorize } from '../common/guards/role.guard';
import { validateAdminSession } from '../common/middlewares/session.middleware';

const router = Router();
const companyAuthController = new CompanyAuthController();

// ─── Public Routes ────────────────────────────────────────────────────────────
router.post('/login', companyAuthController.login);
router.post('/logout', companyAuthController.logout);
router.post('/refresh-token', companyAuthController.refreshToken);
router.post('/verify-employee', companyAuthController.verifyEmployeeToken);
router.post('/forgot-password', companyAuthController.forgotPassword);
router.post('/reset-password', companyAuthController.resetPassword);

// ─── Session Management ───────────────────────────────────────────────────────
// session-status uses x-polling header → non-sliding (won't reset idle timer)
router.get('/session-status', authorize(['super_admin', 'admin', 'employee']), companyAuthController.getSessionStatus);
router.post('/extend-session', authorize(['super_admin', 'admin', 'employee']), validateAdminSession, companyAuthController.extendSession);

// ─── Protected Routes (session-guarded) ──────────────────────────────────────
router.get('/me', authorize(['super_admin', 'admin', 'employee']), validateAdminSession, companyAuthController.getMe);
router.put('/me', authorize(['super_admin', 'admin', 'employee']), validateAdminSession, companyAuthController.updateMyProfile);
router.put('/me/change-password', authorize(['super_admin', 'admin', 'employee']), validateAdminSession, companyAuthController.changePassword);

// Super-admin only: invite & manage employees
router.get('/employees', authorize(['super_admin']), validateAdminSession, companyAuthController.getEmployees);
router.post('/invite', authorize(['super_admin']), validateAdminSession, companyAuthController.inviteEmployee);
router.patch('/employees/:id', authorize(['super_admin']), validateAdminSession, companyAuthController.updateEmployee);
router.delete('/employees/:id', authorize(['super_admin']), validateAdminSession, companyAuthController.deleteEmployee);
router.post('/employees/:id/resend-invite', authorize(['super_admin']), validateAdminSession, companyAuthController.resendInvite);
router.patch('/employees/:id/block', authorize(['super_admin']), validateAdminSession, companyAuthController.toggleBlock);
router.patch('/employees/:id/role', authorize(['super_admin']), validateAdminSession, companyAuthController.assignRole);

// Super-admin only: CRUD for custom roles
router.get('/roles', authorize(['super_admin']), validateAdminSession, companyAuthController.listRoles);
router.post('/roles', authorize(['super_admin']), validateAdminSession, companyAuthController.createRole);
router.patch('/roles/:id', authorize(['super_admin']), validateAdminSession, companyAuthController.updateRole);
router.delete('/roles/:id', authorize(['super_admin']), validateAdminSession, companyAuthController.deleteRole);

// Super-admin only: Activity Logs
router.get('/activity-logs', authorize(['super_admin']), validateAdminSession, companyAuthController.getActivityLogs);
router.get('/activity-logs/:employeeId', authorize(['super_admin']), validateAdminSession, companyAuthController.getEmployeeActivityLogs);

export default router;
