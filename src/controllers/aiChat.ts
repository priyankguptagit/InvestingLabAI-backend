import { Request, Response } from 'express';
import aiChatbotService from '../services/aiChatbot';
import { ChatMessageModel } from '../models/chatMessage';
import mongoose from 'mongoose';

// ============================================
// USER CONTROLLERS
// ============================================

/**
 * Send a chat message and get AI response
 * POST /api/chat/message
 * Auth: Required (user, admin, super_admin)
 */
export const sendMessage = async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { message } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Validation
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required and must be a non-empty string'
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message is too long. Maximum 2000 characters allowed.'
      });
    }

    // Get AI response
    const { response, tokensUsed, responseTime } = await aiChatbotService.chat(
      userId,
      message.trim()
    );

    // Save user message only after the AI call succeeds so the current message
    // does not get duplicated into the chat history passed to Gemini.
    await ChatMessageModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    });

    // Save AI response to database
    await ChatMessageModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      metadata: {
        tokensUsed,
        responseTime
      }
    });

    const totalTime = Date.now() - startTime;

    res.status(200).json({
      success: true,
      data: {
        message: response,
        timestamp: new Date().toISOString()
      },
      metadata: {
        responseTime: totalTime
      }
    });
  } catch (error: any) {
    console.error('Send Message Error:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process message. Please try again.'
    });
  }
};

/**
 * Get stock analysis/recommendation
 * GET /api/chat/stock/:symbol/analyze
 * Auth: Required (user, admin, super_admin)
 */
export const analyzeStock = async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const userId = (req as any).user?.id;

    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Stock symbol is required'
      });
    }

    const symbolUpper = symbol.trim().toUpperCase();

    // Get AI analysis
    const analysis = await aiChatbotService.analyzeStock(symbolUpper);

    // Save analysis to user's chat history
    await ChatMessageModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      role: 'assistant',
      content: `Stock Analysis for ${symbolUpper}:\n\n${analysis}`,
      timestamp: new Date(),
      metadata: {
        stockSymbol: symbolUpper,
        queryType: 'stock-analysis'
      }
    });

    res.status(200).json({
      success: true,
      data: {
        symbol: symbolUpper,
        analysis,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Stock Analysis Error:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze stock.'
    });
  }
};

/**
 * Get portfolio recommendation
 * POST /api/chat/portfolio/recommend
 * Auth: Required (user, admin, super_admin)
 */
export const recommendPortfolio = async (req: Request, res: Response) => {
  try {
    const { budget, riskLevel } = req.body;
    const userId = (req as any).user?.id;

    // Validation
    if (!budget || typeof budget !== 'number' || budget <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid budget amount is required (positive number)'
      });
    }

    if (budget < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Minimum budget should be ₹1,000'
      });
    }

    if (!riskLevel || !['low', 'medium', 'high'].includes(riskLevel)) {
      return res.status(400).json({
        success: false,
        message: 'Risk level is required (low, medium, or high)'
      });
    }

    // Get portfolio recommendation
    const recommendation = await aiChatbotService.recommendPortfolio(
      budget,
      riskLevel
    );

    // Save recommendation to user's chat history
    await ChatMessageModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      role: 'assistant',
      content: `Portfolio Recommendation (Budget: ₹${budget.toLocaleString('en-IN')}, Risk: ${riskLevel}):\n\n${recommendation}`,
      timestamp: new Date(),
      metadata: {
        queryType: 'portfolio-recommendation'
      }
    });

    res.status(200).json({
      success: true,
      data: {
        budget,
        riskLevel,
        recommendation,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Portfolio Recommendation Error:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate portfolio recommendation.'
    });
  }
};

/**
 * Get user's own chat history
 * GET /api/chat/history?limit=50
 * Auth: Required (user, admin, super_admin)
 */
export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200); // Max 200

    const messages = await ChatMessageModel.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('-__v')
      .lean();

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages.reverse() // Chronological order
    });
  } catch (error: any) {
    console.error('Get Chat History Error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat history.'
    });
  }
};

/**
 * Clear user's own chat history
 * DELETE /api/chat/history
 * Auth: Required (user, admin, super_admin)
 */
export const clearChatHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const result = await ChatMessageModel.deleteMany({ userId });

    res.status(200).json({
      success: true,
      message: `Chat history cleared successfully. ${result.deletedCount} messages deleted.`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error: any) {
    console.error('Clear Chat History Error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to clear chat history.'
    });
  }
};

// ============================================
// ADMIN CONTROLLERS
// ============================================

/**
 * Get all users' conversations (Admin only)
 * GET /api/chat/admin/conversations?limit=100&page=1
 * Auth: Required (admin, super_admin only)
 */
export const getAllConversations = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const skip = (page - 1) * limit;

    const [messages, totalCount] = await Promise.all([
      ChatMessageModel.find()
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email') // Populate user details
        .select('-__v')
        .lean(),
      
      ChatMessageModel.countDocuments()
    ]);

    res.status(200).json({
      success: true,
      count: messages.length,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      data: messages
    });
  } catch (error: any) {
    console.error('Get All Conversations Error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations.'
    });
  }
};

/**
 * Get specific user's chat history (Admin only)
 * GET /api/chat/admin/user/:userId/history?limit=100
 * Auth: Required (admin, super_admin only)
 */
export const getUserChatHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    // Validate userId format
    if (!userId || typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const messages = await ChatMessageModel.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('-__v')
      .lean();

    res.status(200).json({
      success: true,
      userId,
      count: messages.length,
      data: messages.reverse() // Chronological order
    });
  } catch (error: any) {
    console.error('Get User Chat History Error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user chat history.'
    });
  }
};

/**
 * Get chat analytics (Admin only)
 * GET /api/chat/admin/analytics
 * Auth: Required (admin, super_admin only)
 */
export const getChatAnalytics = async (req: Request, res: Response) => {
  try {
    const [
      totalMessages,
      totalUsers,
      messagesByType,
      recentActivity
    ] = await Promise.all([
      // Total messages
      ChatMessageModel.countDocuments(),
      
      // Unique users who have chatted
      ChatMessageModel.distinct('userId'),
      
      // Messages by query type
      ChatMessageModel.aggregate([
        { $match: { 'metadata.queryType': { $exists: true } } },
        { $group: { _id: '$metadata.queryType', count: { $sum: 1 } } }
      ]),
      
      // Messages in last 24 hours
      ChatMessageModel.countDocuments({
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    ]);

    // Average response time
    const avgResponseTime = await ChatMessageModel.aggregate([
      { $match: { 'metadata.responseTime': { $exists: true } } },
      { $group: { _id: null, avgTime: { $avg: '$metadata.responseTime' } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalMessages,
        totalUsers: totalUsers.length,
        messagesByType: messagesByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {} as Record<string, number>),
        recentActivity: {
          last24Hours: recentActivity
        },
        averageResponseTime: avgResponseTime[0]?.avgTime 
          ? Math.round(avgResponseTime[0].avgTime) 
          : null
      }
    });
  } catch (error: any) {
    console.error('Get Chat Analytics Error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics.'
    });
  }
};

/**
 * Delete specific user's chat history (Admin only)
 * DELETE /api/chat/admin/user/:userId/history
 * Auth: Required (admin, super_admin only)
 */
export const deleteUserChatHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Validate userId format
    if (!userId || typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const result = await ChatMessageModel.deleteMany({ userId });

    res.status(200).json({
      success: true,
      message: `User chat history deleted successfully.`,
      data: {
        userId,
        deletedCount: result.deletedCount
      }
    });
  } catch (error: any) {
    console.error('Delete User Chat History Error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete user chat history.'
    });
  }
};
