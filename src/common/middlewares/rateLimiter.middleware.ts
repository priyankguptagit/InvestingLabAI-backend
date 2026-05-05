import rateLimit from 'express-rate-limit';

// AI Chat message rate limiter (10 messages per minute)
export const aiChatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many messages. Please wait before sending more.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ Fixed: Don't manually access req.ip
  keyGenerator: (req) => {
    return (req as any).user?.userId || 'anonymous';
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: true
});

// Portfolio recommendation limiter (3 per 5 minutes)
export const portfolioLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: 'Portfolio recommendation limit reached. Please try again in 5 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.userId || 'anonymous';
  }
});

// Stock recommendation limiter (15 per minute)
export const stockRecommendationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    message: 'Too many stock queries. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.userId || 'anonymous';
  }
});

// Admin analytics limiter
export const adminAnalyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Too many admin requests.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.userId || 'admin-anonymous';
  }
});