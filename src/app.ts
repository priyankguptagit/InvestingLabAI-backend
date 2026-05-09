import express, { Application, Request, Response } from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import hpp from "hpp";
import rateLimit from "express-rate-limit";

import { securityHeaders } from "./common/middlewares/security.middleware";
import { requestLogger } from "./common/middlewares/logging.middleware";
import { validateSession } from "./common/middlewares/session.middleware";
import { globalErrorHandler } from "./common/errors/errorHandler";
import stockDataRoutes from './routes/stockData';
import newsDataRoutes from './routes/newsData';
import cronService from './services/cronService';
import aiChatRoutes from './routes/aiChat';
import paymentRoutes from './routes/payment';
import paperTradingRoutes from './routes/paperTrading';
import organizationRoutes from "./routes/organization";
import departmentRoutes from "./routes/department";
import coordinatorRoutes from "./routes/coordinator";
import certificateRoutes from "./routes/certificate";
import uploadRoutes from "./routes/upload.routes";
import galleryRoutes from "./routes/gallery.routes";
import watchlistRoutes from "./routes/watchlist";
import inquiryRoutes from "./routes/inquiry";
import feedbackRoutes from "./routes/feedback";
import referralRoutes from "./routes/referral";
import careerRoutes from "./routes/career";

import userRoutes from "./routes/user";
import companyRoutes from "./routes/company";
import { ENV } from "./config/env";

export const createApp = (): Application => {
  const app = express();

  // --- 1. Security Middleware Layer ---
  app.use(helmet());
  app.use(securityHeaders);
  app.use(
    cors({
      origin: ENV.FRONTEND_URL.split(',').map(u => u.trim()),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      exposedHeaders: ["X-Session-Expires-At"],
    })
  );
  app.use(hpp());

  // Login-specific limiter: protects credential endpoints without locking users out
  // after normal in-app navigation.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      success: false,
      message: "Too many login attempts. Please wait a few minutes and try again."
    }
  });

  app.use("/api/users/login", loginLimiter);
  app.use("/api/organization/login", loginLimiter);
  app.use("/api/coordinator/login", loginLimiter);
  app.use("/api/company/login", loginLimiter);

  // Global API limiter for baseline DDoS protection.
  // Auth endpoints are excluded so active usage doesn't block re-login.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const url = req.originalUrl || "";
      return (
        url.startsWith("/api/users/login") ||
        url.startsWith("/api/organization/login") ||
        url.startsWith("/api/coordinator/login")
      );
    },
    message: {
      success: false,
      message: "Too many requests from this IP, please try again later."
    },
  });
  app.use("/api", apiLimiter);

  // --- 2. Parser Middleware Layer ---
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());
  app.use(requestLogger);

  // Serve static files from the public directory (for certificates, etc.)
  app.use('/public', express.static('public'));

  // --- 2.5 Session Middleware ---
  // Session validation runs on protected API routes (after cookie parsing).
  // Public routes (login, register, verify, etc.) are excluded.
  const sessionExcludedPaths = [
    '/api/users/login',
    '/api/users/register',
    '/api/users/verify',
    '/api/users/forgot-password',
    '/api/users/reset-password',
    '/api/users/refresh-token',
    '/api/users/logout',
    '/api/organization/login',
    '/api/organization/register',
    '/api/organization/verify',
    '/api/organization/logout',
    '/api/organization/refresh-token',
    '/api/coordinator/login',
    '/api/coordinator/verify',
    '/api/coordinator/logout',
    '/api/coordinator/refresh-token',
    // Company (internal staff) auth — no session required
    '/api/company/login',
    '/api/company/logout',
    '/api/company/refresh-token',
    '/api/company/verify-employee',   // public: invited employees set password here
    '/api/feedback/public/testimonials',
    '/api/referrals/validate',
    '/api/certificates/validate',
    '/health',
  ];

  app.use('/api', (req, res, next) => {
    const fullPath = req.originalUrl.split('?')[0]; // strip query params
    const isExcluded = sessionExcludedPaths.some(p => fullPath === p || fullPath.startsWith(p + '/'));
    // Also skip public organization endpoints
    if (isExcluded || fullPath.startsWith('/api/organization/public/')) {
      return next();
    }
    // Only validate session if there's a session cookie present
    // (backwards compat: requests without sessionToken skip session check)
    if (!req.cookies?.sessionToken) {
      return next();
    }
    return validateSession(req, res, next);
  });
  // --- 3. Health Check (Keep this fast) ---
  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: "System Operational",
      timestamp: new Date(),
    });
  });

  // --- 4. Routes ---
  app.use("/api/users", userRoutes);
  app.use("/api/company", companyRoutes);
  app.use('/api', stockDataRoutes);
  app.use('/api', newsDataRoutes);
  app.use('/api/ai', aiChatRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/paper-trading', paperTradingRoutes);
  app.use("/api/organization", organizationRoutes);
  app.use("/api/department", departmentRoutes);
  app.use("/api/coordinator", coordinatorRoutes);
  app.use("/api/certificates", certificateRoutes);
  app.use("/api/upload", uploadRoutes);
  app.use("/api/gallery", galleryRoutes);
  app.use("/api/watchlist", watchlistRoutes);
  app.use("/api/inquiries", inquiryRoutes);
  app.use("/api/feedback", feedbackRoutes);
  app.use("/api/referrals", referralRoutes);
  app.use("/api/careers", careerRoutes);

  // --- 5. Error Handling Layer ---
  // 404 Handler for undefined routes
  app.use((req: Request, res: Response) => {
    res
      .status(404)
      .json({ success: false, message: `Route ${req.originalUrl} not found` });
  });

  app.use(globalErrorHandler);

  return app;
};
