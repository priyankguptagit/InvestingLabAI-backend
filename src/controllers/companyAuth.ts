import { Request, Response } from 'express';
import { CompanyAuthService } from '../services/companyAuth';
import { asyncHandler } from '../common/errors/errorHandler';
import { z } from 'zod';
import { Session } from '../models/Session';
import { ADMIN_SESSION_CONFIG } from '../common/middlewares/session.middleware';
import crypto from 'crypto';

const companyAuthService = new CompanyAuthService();

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
});

export class CompanyAuthController {

    // ─── POST /api/company/login ────────────────────────────────────────────────
    login = asyncHandler(async (req: Request, res: Response) => {
        const { email, password } = loginSchema.parse(req.body);
        const result = await companyAuthService.login(email, password);

        this.setAuthCookies(res, result.accessToken, result.refreshToken);

        // Create a server-side session for idle/hard-cap tracking
        const now = new Date();
        const sessionToken = crypto.randomBytes(32).toString('hex');
        await Session.create({
            userId: (result.member._id as any).toString(),
            sessionToken,
            loginAt: now,
            expiresAt: new Date(now.getTime() + ADMIN_SESSION_CONFIG.IDLE_TIMEOUT_MS),
            hardCapAt: new Date(now.getTime() + ADMIN_SESSION_CONFIG.HARD_CAP_MS),
            isValid: true,
        });

        this.setSessionCookie(res, sessionToken);

        const sessionExpiresAt = new Date(now.getTime() + ADMIN_SESSION_CONFIG.IDLE_TIMEOUT_MS).toISOString();
        res.setHeader('X-Session-Expires-At', sessionExpiresAt);

        res.status(200).json({
            success: true,
            user: {
                id: result.member._id,
                name: result.member.name,
                email: result.member.email,
                role: result.member.role,
                customRole: result.member.customRole,
                model: 'CompanyMember',
                avatar: result.member.avatar ?? null,
                isActive: result.member.isActive,
                lastLogin: result.member.lastLogin,
            },
        });
    });

    // ─── GET /api/company/me ─────────────────────────────────────────────────────
    getMe = asyncHandler(async (req: Request, res: Response) => {
        const tokenUser = (req as any).user;

        if (!tokenUser?.id) {
            res.status(401).json({ success: false, message: 'Not authenticated' });
            return;
        }

        const member = await companyAuthService.getMemberById(tokenUser.id);

        res.status(200).json({
            success: true,
            user: {
                id: member._id,
                name: member.name,
                email: member.email,
                role: member.role,
                customRole: member.customRole,
                model: 'CompanyMember',
                phone: member.phone ?? null,
                avatar: member.avatar ?? null,
                isActive: member.isActive,
                isVerified: member.isVerified,
                lastLogin: member.lastLogin,
                createdAt: (member as any).createdAt,
            },
        });
    });

    // ─── PUT /api/company/me ──────────────────────────────────────────────────────
    // Updates CompanyMemberModel avatar/name/phone — never touches UserModel
    updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
        const tokenUser = (req as any).user;

        if (!tokenUser?.id) {
            res.status(401).json({ success: false, message: 'Not authenticated' });
            return;
        }

        const { name, avatar, phone } = req.body;
        const updateData: { name?: string; avatar?: string; phone?: string } = {};
        if (name !== undefined) updateData.name = String(name).trim();
        if (avatar !== undefined) updateData.avatar = String(avatar);
        if (phone !== undefined) updateData.phone = String(phone).trim();

        const member = await companyAuthService.updateMemberProfile(tokenUser.id, updateData);

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: member._id,
                name: member.name,
                email: member.email,
                role: member.role,
                phone: member.phone ?? null,
                avatar: member.avatar ?? null,
            },
        });
    });

    // ─── PUT /api/company/me/change-password ──────────────────────────────────────
    changePassword = asyncHandler(async (req: Request, res: Response) => {
        const tokenUser = (req as any).user;
        if (!tokenUser?.id) {
            res.status(401).json({ success: false, message: 'Not authenticated' });
            return;
        }

        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
            return;
        }
        if (String(newPassword).length < 8) {
            res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
            return;
        }

        const result = await companyAuthService.changePassword(tokenUser.id, currentPassword, newPassword);
        res.status(200).json({ success: true, ...result });
    });

    // ─── GET /api/company/roles ───────────────────────────────────────────────────
    listRoles = asyncHandler(async (_req: Request, res: Response) => {
        const roles = await companyAuthService.listRoles();
        res.status(200).json({ success: true, roles });
    });

    // ─── POST /api/company/roles ──────────────────────────────────────────────────
    createRole = asyncHandler(async (req: Request, res: Response) => {
        const { name, description = '', permissions = [] } = req.body;
        if (!name || typeof name !== 'string') {
            res.status(400).json({ success: false, message: 'Role name is required' });
            return;
        }
        const tokenUser = (req as any).user;
        const role = await companyAuthService.createRole(
            name,
            description,
            permissions,
            tokenUser.id
        );
        res.status(201).json({ success: true, role });
    });

    // ─── PATCH /api/company/roles/:id ─────────────────────────────────────────────
    updateRole = asyncHandler(async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const { name, description, permissions } = req.body;
        const tokenUser = (req as any).user;
        const role = await companyAuthService.updateRole(id, { name, description, permissions }, tokenUser.id);
        res.status(200).json({ success: true, role });
    });

    // ─── DELETE /api/company/roles/:id ───────────────────────────────────────────
    deleteRole = asyncHandler(async (req: Request, res: Response) => {
        const id = req.params.id as string;
        await companyAuthService.deleteRole(id);
        res.status(200).json({ success: true, message: 'Role deleted' });
    });

    // ─── GET /api/company/employees ──────────────────────────────────────────────
    getEmployees = asyncHandler(async (req: Request, res: Response) => {
        const search = req.query.search as string | undefined;
        const members = await companyAuthService.listAllMembers(search);

        res.status(200).json({
            success: true,
            employees: members,
            total: members.length,
        });
    });

    // ─── POST /api/company/invite ─────────────────────────────────────────────────
    inviteEmployee = asyncHandler(async (req: Request, res: Response) => {
        const tokenUser = (req as any).user;
        const { name, email, phone, aadharNumber, permanentAddress, joiningDate } = req.body;

        if (!name || typeof name !== 'string' || !name.trim()) {
            res.status(400).json({ success: false, message: 'Name is required' });
            return;
        }
        if (!email || typeof email !== 'string') {
            res.status(400).json({ success: false, message: 'Email is required' });
            return;
        }

        const member = await companyAuthService.inviteEmployee(
            name,
            email,
            phone,
            aadharNumber,
            permanentAddress,
            joiningDate,
            tokenUser.id
        );

        res.status(201).json({
            success: true,
            message: `Invite sent to ${member.email}`,
            employee: member,
        });
    });

    // ─── PATCH /api/company/employees/:id ────────────────────────────────────────
    updateEmployee = asyncHandler(async (req: Request, res: Response) => {
        const tokenUser = (req as any).user;
        const id = req.params.id as string;
        const { name, phone, permanentAddress, joiningDate } = req.body;

        const member = await companyAuthService.updateEmployee(id, { name, phone, permanentAddress, joiningDate }, tokenUser.id as string);

        res.status(200).json({ success: true, message: 'Employee updated', employee: member });
    });

    // ─── DELETE /api/company/employees/:id ───────────────────────────────────────
    deleteEmployee = asyncHandler(async (req: Request, res: Response) => {
        const tokenUser = (req as any).user;
        const id = req.params.id as string;

        await companyAuthService.deleteEmployee(id, tokenUser.id as string);

        res.status(200).json({ success: true, message: 'Employee deleted' });
    });

    // ─── POST /api/company/employees/:id/resend-invite ───────────────────────────
    resendInvite = asyncHandler(async (req: Request, res: Response) => {
        const tokenUser = (req as any).user;
        const id = req.params.id as string;

        await companyAuthService.resendInvite(id, tokenUser.id as string);

        res.status(200).json({ success: true, message: 'Invite resent successfully.' });
    });

    // ─── PATCH /api/company/employees/:id/block ───────────────────────────────────
    toggleBlock = asyncHandler(async (req: Request, res: Response) => {
        const tokenUser = (req as any).user;
        const id = req.params.id as string;

        const member = await companyAuthService.toggleBlock(id, tokenUser.id as string);

        res.status(200).json({
            success: true,
            message: member.isActive ? 'Employee unblocked' : 'Employee blocked',
            employee: member,
        });
    });

    // ─── POST /api/company/verify-employee (PUBLIC) ───────────────────────────────
    verifyEmployeeToken = asyncHandler(async (req: Request, res: Response) => {
        const { token, password } = req.body;

        if (!token || !password) {
            res.status(400).json({ success: false, message: 'Token and password are required' });
            return;
        }
        if (String(password).length < 8) {
            res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
            return;
        }

        const result = await companyAuthService.verifyEmployeeToken(token, password);
        res.status(200).json({ success: true, ...result });
    });

    // ─── POST /api/company/forgot-password (PUBLIC) ───────────────────────────────
    forgotPassword = asyncHandler(async (req: Request, res: Response) => {
        const { email } = req.body;
        if (!email || typeof email !== 'string') {
            res.status(400).json({ success: false, message: 'Email is required' });
            return;
        }
        // Always returns the same message to prevent user enumeration
        const result = await companyAuthService.requestPasswordReset(email);
        res.status(200).json({ success: true, ...result });
    });

    // ─── POST /api/company/reset-password (PUBLIC) ────────────────────────────────
    resetPassword = asyncHandler(async (req: Request, res: Response) => {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            res.status(400).json({ success: false, message: 'Token and newPassword are required' });
            return;
        }
        if (String(newPassword).length < 8) {
            res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
            return;
        }
        const result = await companyAuthService.resetPassword(token, newPassword);
        res.status(200).json({ success: true, ...result });
    });

    // ─── PATCH /api/company/employees/:id/role ────────────────────────────────────
    assignRole = asyncHandler(async (req: Request, res: Response) => {
        const memberId = req.params.id as string;
        const { roleId } = req.body; // string | null

        const updatedMember = await companyAuthService.assignRole(memberId, roleId);

        res.status(200).json({
            success: true,
            message: 'Role assigned successfully',
            member: updatedMember,
        });
    });

    // ─── GET /api/company/activity-logs ───────────────────────────────────────────
    getActivityLogs = asyncHandler(async (req: Request, res: Response) => {
        const logs = await companyAuthService.getActivityLogs();
        res.status(200).json({ success: true, logs });
    });

    // ─── GET /api/company/activity-logs/:employeeId ──────────────────────────────
    getEmployeeActivityLogs = asyncHandler(async (req: Request, res: Response) => {
        const { employeeId } = req.params;
        const logs = await companyAuthService.getEmployeeActivityLogs(employeeId as string);
        res.status(200).json({ success: true, logs });
    });

    // ─── GET /api/company/session-status ─────────────────────────────────────────
    getSessionStatus = asyncHandler(async (req: Request, res: Response) => {
        const sessionToken = req.cookies?.sessionToken;
        if (!sessionToken) {
            return res.status(200).json({ success: false, message: 'No session' });
        }
        const sessionDoc = await Session.findOne({ sessionToken, isValid: true });
        if (!sessionDoc) {
            return res.status(200).json({ success: false, message: 'Session not found' });
        }
        return res.status(200).json({
            success: true,
            expiresAt: sessionDoc.expiresAt.toISOString(),
            hardCapAt: sessionDoc.hardCapAt.toISOString(),
        });
    });

    // ─── POST /api/company/extend-session ────────────────────────────────────────
    extendSession = asyncHandler(async (req: Request, res: Response) => {
        const sessionToken = req.cookies?.sessionToken;
        if (!sessionToken) {
            return res.status(401).json({ success: false, message: 'No session to extend' });
        }
        const sessionDoc = await Session.findOne({ sessionToken, isValid: true });
        if (!sessionDoc) {
            return res.status(401).json({ success: false, message: 'Session not found or expired' });
        }
        const now = new Date();
        if (now > sessionDoc.hardCapAt) {
            return res.status(401).json({ success: false, message: 'Hard cap reached', code: 'SESSION_HARD_CAP' });
        }
        const newExpiry = new Date(now.getTime() + ADMIN_SESSION_CONFIG.IDLE_TIMEOUT_MS);
        sessionDoc.expiresAt = newExpiry > sessionDoc.hardCapAt ? sessionDoc.hardCapAt : newExpiry;
        await sessionDoc.save();
        res.setHeader('X-Session-Expires-At', sessionDoc.expiresAt.toISOString());
        return res.status(200).json({
            success: true,
            expiresAt: sessionDoc.expiresAt.toISOString(),
        });
    });

    // ─── POST /api/company/logout ────────────────────────────────────────────────
    logout = asyncHandler(async (req: Request, res: Response) => {
        const sessionToken = req.cookies?.sessionToken;
        if (sessionToken) {
            await Session.findOneAndUpdate(
                { sessionToken, isValid: true },
                { isValid: false }
            );
        }

        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? ('none' as const) : ('lax' as const),
        };

        res.clearCookie('accessToken', cookieOptions);
        res.clearCookie('refreshToken', cookieOptions);
        res.clearCookie('sessionToken', cookieOptions);
        res.status(200).json({ success: true, message: 'Logged out' });
    });

    // ─── POST /api/company/refresh-token ─────────────────────────────────────────
    refreshToken = asyncHandler(async (req: Request, res: Response) => {
        const refreshToken = req.cookies?.refreshToken;

        if (!refreshToken) {
            res.status(401).json({ success: false, message: 'No refresh token provided' });
            return;
        }

        try {
            const result = await companyAuthService.refreshToken(refreshToken);
            this.setAuthCookies(res, result.accessToken, result.refreshToken);
            res.status(200).json({ success: true });
        } catch (error: any) {
            res.status(401).json({ success: false, message: error.message || 'Invalid refresh token' });
        }
    });

    // ─── Helpers ──────────────────────────────────────────────────────────────────
    private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
        const isProduction = process.env.NODE_ENV === 'production';

        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: 15 * 60 * 1000, // 15 min
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            // No maxAge → session cookie; company members stay logged in per browser session
        });
    }

    private setSessionCookie(res: Response, sessionToken: string) {
        const isProduction = process.env.NODE_ENV === 'production';
        res.cookie('sessionToken', sessionToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: ADMIN_SESSION_CONFIG.HARD_CAP_MS,
        });
    }

}
