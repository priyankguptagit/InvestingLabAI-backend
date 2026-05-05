import { Request, Response } from "express";
import { UserService } from "../services/user";
import { asyncHandler } from "../common/errors/errorHandler";
import { z } from "zod";
import { ENV } from "../config/env";
import { OrganizationModel } from '../models/organization';
import { getEffectivePlan } from '../utils/getEffectivePlan';
import crypto from 'crypto';
import { Session } from '../models/Session';
import { SESSION_CONFIG } from '../common/middlewares/session.middleware';

const userService = new UserService();

// 1. UPDATE: Add optional 'name' to the schema
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  organizationId: z.string().optional(),
  departmentId: z.string().optional()
});

const verifySchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  rememberMe: z.boolean().optional().default(false),
});
const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

export class UserController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const { email, name, organizationId, departmentId } = registerSchema.parse(req.body);
    const result = await userService.register(email, name, organizationId, departmentId);
    res.status(200).json({ success: true, ...result });
  });


  verify = asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = verifySchema.parse(req.body);
    const result = await userService.verify(token, password);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    res.status(200).json({ success: true, user: result.user });
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password, rememberMe } = loginSchema.parse(req.body);
    const result = await userService.login(email, password, rememberMe);

    this.setAuthCookies(res, result.accessToken, result.refreshToken, rememberMe);

    // Create server-side session for timeout tracking
    const now = new Date();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const session = await Session.create({
      userId: result.user._id || result.user.id,
      sessionToken,
      loginAt: now,
      expiresAt: new Date(now.getTime() + SESSION_CONFIG.IDLE_TIMEOUT_MS),
      hardCapAt: new Date(now.getTime() + SESSION_CONFIG.HARD_CAP_MS),
      isValid: true,
    });

    this.setSessionCookie(res, sessionToken);

    res.status(200).json({
      success: true,
      user: result.user,
      sessionExpiresAt: session.expiresAt.toISOString(),
    });
  });

  getMe = asyncHandler(async (req: Request, res: Response) => {
    const tokenUser = (req as any).user;

    if (!tokenUser || !tokenUser.id) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    // Fetch fresh user data from database to get latest subscription info
    const user = await userService.getUserById(tokenUser.id);

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    // ── Transparently create a session if the user doesn't have one yet ──
    // This handles the case where a user was logged in before the session
    // system was deployed and still has valid JWT cookies but no sessionToken.
    if (!req.cookies?.sessionToken) {
      const now = new Date();
      const newSessionToken = crypto.randomBytes(32).toString('hex');
      const session = await Session.create({
        userId: user._id || user.id,
        sessionToken: newSessionToken,
        loginAt: now,
        expiresAt: new Date(now.getTime() + SESSION_CONFIG.IDLE_TIMEOUT_MS),
        hardCapAt: new Date(now.getTime() + SESSION_CONFIG.HARD_CAP_MS),
        isValid: true,
      });
      this.setSessionCookie(res, newSessionToken);
      res.setHeader('X-Session-Expires-At', session.expiresAt.toISOString());
    }

    // Ensure a valid name is always returned
    const displayName =
      user.name && user.name !== "User" ? user.name : user.email.split("@")[0];

    // ─── Organization Student Logic ──────────────────────────────────────────
    // If the user belongs to an approved organization, derive their subscription
    // from the organization's subscription instead of their own payment record.
    const isOrgStudent =
      !!user.organization && user.organizationApprovalStatus === 'approved';

    if (isOrgStudent) {
      const org = await OrganizationModel.findById(user.organization)
        .select('subscriptionStatus subscriptionPlan subscriptionExpiry planSeatLimits organizationName isActive logoUrl website');

      if (org) {
        // Use our central function to determine the real plan
        const plan = getEffectivePlan(user as any, org);
        const orgSubActive = plan !== 'Free';

        if (orgSubActive) {
          // Student inherits the org's premium plan
          return res.status(200).json({
            success: true,
            user: {
              id: user.id || user._id,
              email: user.email,
              role: user.role,
              name: displayName,
              avatar: user.avatar || null,
              isVerified: user.isVerified || false,
              currentPlan: plan, // Normalized inherited plan
              orgName: org.organizationName,
              orgLogoUrl: org.logoUrl,
              orgWebsite: org.website || null,
              subscriptionStatus: 'active',
              subscriptionExpiry: org.subscriptionExpiry,
              subscriptionId: undefined,
              hasUsedTrial: user.hasUsedTrial || false,
              isOnTrial: false,
              trialEndDate: undefined,
              isOrgStudent: true,
            },
          });
        }
      }

      // Org subscription expired or inactive — student gets Free tier
      return res.status(200).json({
        success: true,
        user: {
          id: user.id || user._id,
          email: user.email,
          role: user.role,
          name: displayName,
          avatar: user.avatar || null,
          isVerified: user.isVerified || false,
          currentPlan: 'Free',
          subscriptionStatus: undefined,
          subscriptionExpiry: undefined,
          subscriptionId: undefined,
          hasUsedTrial: user.hasUsedTrial || false,
          isOnTrial: false,
          trialEndDate: undefined,
          isOrgStudent: true,
          orgName: org?.organizationName,
          orgLogoUrl: org?.logoUrl,
          orgWebsite: org?.website || null,
        },
      });
    }
    // ─── End Organization Student Logic ─────────────────────────────────────

    // ─── Regular User Logic ───────────────────────────────────────────────
    // Individual users might have an active subscription or trial
    const effectivePlan = getEffectivePlan(user as any);
    // ── Expiry cleanup: runs on EVERY getMe call to self-heal stale DB state ───
    // Bug fix: previously only ran when isOnTrial===true, so an already-flipped
    // isOnTrial=false with an expired trialEndDate was never cleaned up, leaving
    // currentPlan stuck at the old plan name (e.g. 'Team') in the database.
    const now = new Date();
    const trialExpired  = user.isOnTrial && user.trialEndDate && new Date(user.trialEndDate) < now;
    // planExpired: only fire if the plan is genuinely expired AND the DB status isn't 'active'
    // This prevents the cleanup from nuking a freshly-paid subscription on the first getMe call.
    const planExpired   =
      user.subscriptionExpiry &&
      new Date(user.subscriptionExpiry) < now &&
      user.subscriptionStatus !== 'active';  // ← key guard: 'active' means payment just processed
    const hasInvalidPlan = user.currentPlan && !['Free','Silver','Gold','Diamond'].includes(user.currentPlan);

    if (trialExpired || planExpired || hasInvalidPlan) {
      // Only write if something actually needs fixing — don't touch healthy paid accounts
      const needsWrite =
        user.isOnTrial ||        // trial flag still set but trial date passed
        hasInvalidPlan;          // invalid plan name (e.g. 'Team' from old data)
      // Note: planExpired already implies the subscription needs to be reset

      if (needsWrite || planExpired) {
        user.isOnTrial = false;
        user.currentPlan = 'Free';
        user.subscriptionStatus = 'expired';
        await user.save();
      }
    }

    // ✅ Handle Org Info for everyone (even if not "approved" yet for plan inheritance)
    let orgData = {};
    if (user.organization) {
      const org = await OrganizationModel.findById(user.organization).select('organizationName logoUrl website');
      if (org) {
        orgData = {
          isOrgStudent: true,
          orgName: org.organizationName,
          orgLogoUrl: org.logoUrl,
          orgWebsite: org.website || null,
        };
      }
    }

    res.status(200).json({
      success: true,
      user: {
        id: user.id || user._id,
        email: user.email,
        role: user.role,
        name: displayName,
        avatar: user.avatar || null,
        isVerified: user.isVerified || false,
        preferredCurrency: user.preferredCurrency || 'INR',
        // Subscription fields
        currentPlan: effectivePlan,
        subscriptionStatus: effectivePlan === 'Free' ? undefined : user.subscriptionStatus,
        subscriptionExpiry: effectivePlan === 'Free' ? undefined : user.subscriptionExpiry,
        subscriptionId: user.subscriptionId,
        // Trial fields
        hasUsedTrial: user.hasUsedTrial || false,
        isOnTrial: user.isOnTrial || false,
        trialEndDate: user.trialEndDate,
        // Stats fields
        tradingLevel: user.tradingLevel,
        totalPaperTradesCount: user.totalPaperTradesCount || 0,
        profitablePaperTrades: user.profitablePaperTrades || 0,
        totalPaperPL: user.totalPaperPL || 0,
        virtualBalance: user.virtualBalance || 100000,
        createdAt: (user as any).createdAt,
        lastLogin: user.lastLogin,
        // Org Info
        isOrgStudent: !!user.organization,
        ...orgData
      },
    });
  });


  logout = asyncHandler(async (req: Request, res: Response) => {
    // Invalidate the server-side session
    const sessionToken = req.cookies?.sessionToken;
    if (sessionToken) {
      await Session.findOneAndUpdate(
        { sessionToken, isValid: true },
        { isValid: false }
      );
    }

    // Clear cookies with same settings to ensure they are actually removed
    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" as const : "lax" as const,
    };

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);
    res.clearCookie("sessionToken", cookieOptions);
    res.status(200).json({ success: true, message: "Logged out" });
  });

  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, message: "No refresh token provided" });
      return;
    }

    try {
      const result = await userService.refreshToken(refreshToken);
      this.setAuthCookies(res, result.accessToken, result.refreshToken, result.rememberMe);
      res.status(200).json({ success: true, accessToken: result.accessToken });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message || "Invalid refresh token" });
    }
  });

  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await userService.forgotPassword(email);
    res.status(200).json({ success: true, ...result });
  });

  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const result = await userService.resetPassword(token, newPassword);
    res.status(200).json({ success: true, ...result });
  });

  // --- CRITICAL FIX FOR VERCEL ---
  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    rememberMe: boolean = false,
  ) {
    const isProduction = process.env.NODE_ENV === "production";

    // Access token: always short-lived (15 min)
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
    });

    // Refresh token: session cookie (browser close) vs persistent (30 days)
    const refreshCookieOptions: any = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    };

    if (rememberMe) {
      refreshCookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }
    // Without rememberMe: no maxAge = session cookie (cleared on browser close)

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);
  }

  /**
   * Sets the session tracking cookie (separate from JWT auth cookies).
   */
  private setSessionCookie(res: Response, sessionToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('sessionToken', sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: SESSION_CONFIG.HARD_CAP_MS, // Max lifetime = hard cap
    });
  }

  /**
   * POST /extend-session
   * Renews the session idle timer. Called by the warning modal.
   */
  extendSession = asyncHandler(async (req: Request, res: Response) => {
    const sessionToken = req.cookies?.sessionToken;

    if (!sessionToken) {
      res.status(401).json({
        success: false,
        message: 'No session found.',
        code: 'SESSION_MISSING',
      });
      return;
    }

    const session = await Session.findOne({
      sessionToken,
      isValid: true,
    });

    if (!session) {
      res.status(401).json({
        success: false,
        message: 'Session is invalid.',
        code: 'SESSION_INVALID',
      });
      return;
    }

    const now = new Date();

    // Check hard cap
    if (now > session.hardCapAt) {
      session.isValid = false;
      await session.save();
      res.status(401).json({
        success: false,
        message: 'Session has reached maximum duration. Please log in again.',
        code: 'SESSION_HARD_CAP',
      });
      return;
    }

    // Slide the expiry window
    session.expiresAt = new Date(
      Math.min(
        now.getTime() + SESSION_CONFIG.IDLE_TIMEOUT_MS,
        session.hardCapAt.getTime()
      )
    );
    await session.save();

    res.status(200).json({
      success: true,
      message: 'Session extended.',
      expiresAt: session.expiresAt.toISOString(),
      hardCapAt: session.hardCapAt.toISOString(),
    });
  });

  /**
   * GET /session-status
   * Returns current session timing info for the client.
   */
  getSessionStatus = asyncHandler(async (req: Request, res: Response) => {
    const sessionToken = req.cookies?.sessionToken;

    if (!sessionToken) {
      res.status(401).json({
        success: false,
        message: 'No session found.',
        code: 'SESSION_MISSING',
      });
      return;
    }

    const session = await Session.findOne({
      sessionToken,
      isValid: true,
    });

    if (!session) {
      res.status(401).json({
        success: false,
        message: 'Session is invalid.',
        code: 'SESSION_INVALID',
      });
      return;
    }

    res.status(200).json({
      success: true,
      expiresAt: session.expiresAt.toISOString(),
      hardCapAt: session.hardCapAt.toISOString(),
      loginAt: session.loginAt.toISOString(),
    });
  });

  // Get all users with pagination, search, and filter
  getAllUsers = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string || '';
    const role = req.query.role as string || '';
    const status = req.query.status as string || '';
    const organization = req.query.organization as string || '';
    const department = req.query.department as string || '';
    const individualOnly = req.query.individualOnly === 'true';

    const result = await userService.getAllUsers({
      page,
      limit,
      search,
      role,
      status,
      organization,
      department,
      individualOnly,
    });

    res.status(200).json({ success: true, ...result });
  });

  // Get user statistics
  getUserStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await userService.getUserStats();
    res.status(200).json({ success: true, stats });
  });

  // Get single user by ID
  getUserById = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.id as string;
    const user = await userService.getUserById(userId);
    res.status(200).json({ success: true, user });
  });

  // Update user
  updateUser = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.id as string;
    const updateData = req.body;
    const user = await userService.updateUser(userId, updateData);
    res.status(200).json({ success: true, user, message: "User updated successfully" });
  });

  softDeleteUser = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.id as string;
    await userService.softDeleteUser(userId);
    res.status(200).json({ success: true, message: "User archived successfully" });
  });

  // 2. Restore Handler
  restoreUser = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.id as string;
    await userService.restoreUser(userId);
    res.status(200).json({ success: true, message: "User restored successfully" });
  });

  // Delete user
  deleteUser = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.id as string;
    await userService.deleteUser(userId);
    res.status(200).json({ success: true, message: "User deleted successfully" });
  });

  // Toggle user active status
  toggleUserActive = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.id as string;
    const user = await userService.toggleUserActive(userId);
    res.status(200).json({
      success: true,
      user,
      message: `User ${user.isActive ? 'activated' : 'blocked'} successfully`
    });
  });

  // Bulk actions for grouping related requests
  bulkAction = asyncHandler(async (req: Request, res: Response) => {
    const { userIds, action } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ success: false, message: "Invalid userIds" });
      return;
    }

    let result;
    switch (action) {
      case 'archive':
        result = await userService.bulkSoftDelete(userIds);
        break;
      case 'unarchive':
        result = await userService.bulkRestore(userIds);
        break;
      case 'block':
        result = await userService.bulkToggleActive(userIds, false);
        break;
      case 'unblock':
        result = await userService.bulkToggleActive(userIds, true);
        break;
      default:
        res.status(400).json({ success: false, message: "Invalid action" });
        return;
    }

    res.status(200).json({ success: true, ...result });
  });

  // Fetch Full Portfolio Report for the current user
  getMyReport = asyncHandler(async (req: Request, res: Response) => {
    const tokenUser = (req as any).user;

    if (!tokenUser || !tokenUser.id) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const user = await userService.getUserById(tokenUser.id);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    if (!user.portfolioReport || !user.portfolioReport.analysis) {
      res.status(404).json({ success: false, message: "No portfolio report generated yet. Your Coordinator must reconcile your account first." });
      return;
    }

    res.status(200).json({
      success: true,
      report: user.portfolioReport,
      teacherReview: user.teacherReview
    });
  });

  // Admin: change individual user's subscription plan (no Razorpay charge)
  adminChangePlan = asyncHandler(async (req: Request, res: Response) => {
    const adminChangePlanSchema = z.object({
      planName: z.enum(['Silver', 'Gold', 'Diamond', 'Free']),
      durationMonths: z.union([z.literal(1), z.literal(3), z.literal(6)]).optional(),
    });

    const { planName, durationMonths } = adminChangePlanSchema.parse(req.body);
    const userId = req.params.id as string;

    const result = await userService.adminChangePlan(userId, planName, durationMonths);
    res.status(200).json({ success: true, ...result });
  });

  // ── Self-service: update own profile (name, avatar) ──────────────────────
  updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
    const tokenUser = (req as any).user;
    if (!tokenUser?.id) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const { name, avatar, preferredCurrency } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (avatar !== undefined) updateData.avatar = avatar;
    if (preferredCurrency !== undefined) updateData.preferredCurrency = preferredCurrency;

    const user = await userService.updateUser(tokenUser.id, updateData);
    // Bust the client-side sessionStorage cache so next load picks up the new name
    res.status(200).json({ success: true, user, message: "Profile updated successfully" });
  });

  // ── Self-service: change own password ─────────────────────────────────────
  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const tokenUser = (req as any).user;
    if (!tokenUser?.id) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: "currentPassword and newPassword are required" });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: "New password must be at least 8 characters" });
      return;
    }

    await userService.changePassword(tokenUser.id, currentPassword, newPassword);
    res.status(200).json({ success: true, message: "Password changed successfully" });
  });
}
