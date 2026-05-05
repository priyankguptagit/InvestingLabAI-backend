import { Request, Response, NextFunction } from "express";
import { Session } from "../../models/Session";

const isDev = process.env.NODE_ENV !== "production";

/** User portal session config */
export const SESSION_CONFIG = {
  IDLE_TIMEOUT_MS: 15 * 60 * 1000,   // 15 minutes
  HARD_CAP_MS: isDev
    ? 2 * 60 * 60 * 1000             // 2 hours (dev)
    : 4 * 60 * 60 * 1000,           // 4 hours (prod)
};

/** Admin / company portal session config */
export const ADMIN_SESSION_CONFIG = {
  IDLE_TIMEOUT_MS: 15 * 60 * 1000,   // 15 minutes
  HARD_CAP_MS: 4 * 60 * 60 * 1000,  // 4 hours
};

/**
 * Paths whose requests should NEVER slide the idle window.
 * These are polling/status calls that shouldn't count as user activity.
 */
const NON_SLIDING_PATHS = [
  "/api/users/session-status",
  "/api/company/session-status",
];

async function runSessionValidation(
  req: Request,
  res: Response,
  next: NextFunction,
  idleTimeoutMs: number,
  label: string
) {
  const sessionToken = req.cookies?.sessionToken;
  if (!sessionToken) return next();

  try {
    const sessionDoc = await Session.findOne({ sessionToken, isValid: true });

    if (!sessionDoc) {
      return res.status(401).json({
        success: false,
        message: "No active session found. Please log in again.",
        code: "SESSION_INVALID",
      });
    }

    const now = new Date();

    if (now > sessionDoc.hardCapAt) {
      sessionDoc.isValid = false;
      await sessionDoc.save();
      return res.status(401).json({
        success: false,
        message: "Your session time limit has been reached. Please log in again.",
        code: "SESSION_HARD_CAP",
      });
    }

    if (now > sessionDoc.expiresAt) {
      sessionDoc.isValid = false;
      await sessionDoc.save();
      return res.status(401).json({
        success: false,
        message: "Your session has expired due to inactivity. Please log in again.",
        code: "SESSION_IDLE_EXPIRED",
      });
    }

    const fullPath = req.originalUrl.split("?")[0];
    const isPolling = req.headers["x-polling"] === "true";
    const isNonSliding = NON_SLIDING_PATHS.some(p => fullPath === p || fullPath.startsWith(p + "/"));

    if (!isPolling && !isNonSliding) {
      const newExpiry = new Date(now.getTime() + idleTimeoutMs);
      sessionDoc.expiresAt = newExpiry > sessionDoc.hardCapAt ? sessionDoc.hardCapAt : newExpiry;
      await sessionDoc.save();
    }

    res.setHeader("X-Session-Expires-At", sessionDoc.expiresAt.toISOString());
    return next();
  } catch (error) {
    console.error(`[${label}] Error validating session:`, error);
    return next();
  }
}

/**
 * validateSession — User portal session middleware.
 */
export const validateSession = (req: Request, res: Response, next: NextFunction) =>
  runSessionValidation(req, res, next, SESSION_CONFIG.IDLE_TIMEOUT_MS, "SessionMiddleware");

/**
 * validateAdminSession — Admin/company portal session middleware.
 */
export const validateAdminSession = (req: Request, res: Response, next: NextFunction) =>
  runSessionValidation(req, res, next, ADMIN_SESSION_CONFIG.IDLE_TIMEOUT_MS, "AdminSessionMiddleware");
