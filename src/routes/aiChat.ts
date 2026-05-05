import express from 'express';
import {
  // User Controllers
  sendMessage,
  analyzeStock,
  recommendPortfolio,
  getChatHistory,
  clearChatHistory,

  // Admin Controllers
  getAllConversations,
  getUserChatHistory,
  getChatAnalytics,
  deleteUserChatHistory
} from '../controllers/aiChat';

// Guards & Middleware
import { authorize } from '../common/guards/role.guard';
import {
  aiChatLimiter,
  stockRecommendationLimiter,
  portfolioLimiter,
  adminAnalyticsLimiter
} from '../common/middlewares/rateLimiter.middleware';

const router = express.Router();

// ============================================
// USER ROUTES (Authenticated users only)
// ============================================

/**
 * @route   POST /api/chat/message
 * @desc    Send a chat message and get AI response
 * @access  Private (user, admin, super_admin, department_coordinator)
 */
router.post(
  '/chat/message',
  authorize(['user', 'admin', 'super_admin', 'department_coordinator']),
  aiChatLimiter,
  sendMessage
);

/**
 * @route   GET /api/chat/stock/:symbol/analyze
 * @desc    Get AI analysis for a specific stock
 * @access  Private (user, admin, super_admin)
 */
router.get(
  '/chat/stock/:symbol/analyze',
  authorize(['user', 'admin', 'super_admin']),
  stockRecommendationLimiter,
  analyzeStock
);

/**
 * @route   POST /api/chat/portfolio/recommend
 * @desc    Get portfolio recommendation based on budget and risk
 * @access  Private (user, admin, super_admin)
 */
router.post(
  '/chat/portfolio/recommend',
  authorize(['user', 'admin', 'super_admin']),
  portfolioLimiter,
  recommendPortfolio
);

/**
 * @route   GET /api/chat/history
 * @desc    Get user's own chat history
 * @access  Private (user, admin, super_admin)
 */
router.get(
  '/chat/history',
  authorize(['user', 'admin', 'super_admin']),
  getChatHistory
);

/**
 * @route   DELETE /api/chat/history
 * @desc    Clear user's own chat history
 * @access  Private (user, admin, super_admin)
 */
router.delete(
  '/chat/history',
  authorize(['user', 'admin', 'super_admin']),
  clearChatHistory
);

// ============================================
// ADMIN ROUTES (Admin & Super Admin only)
// ============================================

/**
 * @route   GET /api/chat/admin/conversations
 * @desc    Get all users' conversations (paginated)
 * @access  Private (admin, super_admin only)
 */
router.get(
  '/chat/admin/conversations',
  authorize(['admin', 'super_admin']),
  adminAnalyticsLimiter,
  getAllConversations
);

/**
 * @route   GET /api/chat/admin/user/:userId/history
 * @desc    Get specific user's chat history
 * @access  Private (admin, super_admin only)
 */
router.get(
  '/chat/admin/user/:userId/history',
  authorize(['admin', 'super_admin']),
  adminAnalyticsLimiter,
  getUserChatHistory
);

/**
 * @route   GET /api/chat/admin/analytics
 * @desc    Get chat analytics (total messages, users, query types, etc.)
 * @access  Private (admin, super_admin only)
 */
router.get(
  '/chat/admin/analytics',
  authorize(['admin', 'super_admin']),
  adminAnalyticsLimiter,
  getChatAnalytics
);

/**
 * @route   DELETE /api/chat/admin/user/:userId/history
 * @desc    Delete specific user's chat history
 * @access  Private (admin, super_admin only)
 */
router.delete(
  '/chat/admin/user/:userId/history',
  authorize(['admin', 'super_admin']),
  deleteUserChatHistory
);

export default router;
