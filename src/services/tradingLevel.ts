import mongoose from 'mongoose';
import { PaperTradeModel } from '../models/paperTrade';
import { UserModel, IUser } from '../models/user';

// ─── Strict Threshold Definitions ────────────────────────────────────────────

type TradingLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';

interface LevelThreshold {
  closedTrades: number;
  activeTradingDays: number;
  absoluteROI: number;       // percentage, e.g. 3 means 3%
  maxDrawdownCeiling: number; // percentage ceiling, e.g. 15 means ≤ 15%
  winRate: number;            // percentage, e.g. 45 means ≥ 45%
}

const LEVEL_THRESHOLDS: Record<Exclude<TradingLevel, 'BEGINNER'>, LevelThreshold> = {
  INTERMEDIATE: {
    closedTrades: 20,
    activeTradingDays: 5,
    absoluteROI: 3,
    maxDrawdownCeiling: 15,
    winRate: 45,
  },
  ADVANCED: {
    closedTrades: 50,
    activeTradingDays: 15,
    absoluteROI: 10,
    maxDrawdownCeiling: 10,
    winRate: 50,
  },
  EXPERT: {
    closedTrades: 100,
    activeTradingDays: 30,
    absoluteROI: 25,
    maxDrawdownCeiling: 8,
    winRate: 55,
  },
};

// ─── Computed Metrics Interface ──────────────────────────────────────────────

interface UserTradingMetrics {
  userId: string;
  closedTradeCount: number;
  profitableTradeCount: number;
  totalRealizedPL: number;
  distinctActiveDays: number;
  winRate: number;          // 0–100
  absoluteROI: number;      // percentage
  maxDrawdown: number;      // percentage (from User model)
}

// ─── Service Class ───────────────────────────────────────────────────────────

class TradingLevelService {

  /**
   * Run a single-pass MongoDB aggregation pipeline on PaperTrade
   * to compute all necessary metrics for a given user.
   */
  async calculateUserMetrics(userId: string): Promise<UserTradingMetrics | null> {
    try {
      const user = await UserModel.findById(userId).lean();
      if (!user) {
        console.error(`[TradingLevel] User not found: ${userId}`);
        return null;
      }

      const objectId = new mongoose.Types.ObjectId(userId);

      // Single aggregation pipeline — computes all metrics in one DB round-trip
      const pipeline = [
        {
          $match: {
            userId: objectId,
            status: 'EXECUTED',
          },
        },
        {
          $facet: {
            // Branch 1: Metrics from SELL trades (closed positions)
            sellMetrics: [
              { $match: { type: 'SELL' } },
              {
                $group: {
                  _id: null,
                  closedTradeCount: { $sum: 1 },
                  profitableTradeCount: {
                    $sum: {
                      $cond: [{ $gt: [{ $ifNull: ['$realizedPL', 0] }, 0] }, 1, 0],
                    },
                  },
                  totalRealizedPL: { $sum: { $ifNull: ['$realizedPL', 0] } },
                },
              },
            ],
            // Branch 2: Distinct active trading days (across ALL executed trades)
            activeDays: [
              {
                $group: {
                  _id: '$tradingSession', // tradingSession is a date string like "2026-02-28"
                },
              },
              {
                $count: 'distinctDays',
              },
            ],
          },
        },
      ];

      const [result] = await PaperTradeModel.aggregate(pipeline);

      // Extract sell metrics
      const sellData = result.sellMetrics[0] || {
        closedTradeCount: 0,
        profitableTradeCount: 0,
        totalRealizedPL: 0,
      };

      // Extract active days
      const activeDaysData = result.activeDays[0] || { distinctDays: 0 };

      // Calculate derived metrics
      const winRate =
        sellData.closedTradeCount > 0
          ? (sellData.profitableTradeCount / sellData.closedTradeCount) * 100
          : 0;

      const initialBalance = user.initialVirtualBalance || 100000;
      const absoluteROI =
        initialBalance > 0
          ? (sellData.totalRealizedPL / initialBalance) * 100
          : 0;

      return {
        userId,
        closedTradeCount: sellData.closedTradeCount,
        profitableTradeCount: sellData.profitableTradeCount,
        totalRealizedPL: sellData.totalRealizedPL,
        distinctActiveDays: activeDaysData.distinctDays,
        winRate: parseFloat(winRate.toFixed(2)),
        absoluteROI: parseFloat(absoluteROI.toFixed(2)),
        maxDrawdown: user.maxDrawdown || 0,
      };
    } catch (error) {
      console.error(`[TradingLevel] Error calculating metrics for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Pure function: given computed metrics, determine the highest level
   * the user qualifies for. Evaluated from EXPERT → ADVANCED → INTERMEDIATE → BEGINNER.
   */
  determineTradingLevel(metrics: UserTradingMetrics): TradingLevel {
    const levelsDescending: Array<Exclude<TradingLevel, 'BEGINNER'>> = [
      'EXPERT',
      'ADVANCED',
      'INTERMEDIATE',
    ];

    for (const level of levelsDescending) {
      const threshold = LEVEL_THRESHOLDS[level];

      const meetsAllCriteria =
        metrics.closedTradeCount >= threshold.closedTrades &&
        metrics.distinctActiveDays >= threshold.activeTradingDays &&
        metrics.absoluteROI >= threshold.absoluteROI &&
        metrics.maxDrawdown <= threshold.maxDrawdownCeiling &&
        metrics.winRate >= threshold.winRate;

      if (meetsAllCriteria) {
        return level;
      }
    }

    return 'BEGINNER';
  }

  /**
   * Orchestrator: calculate metrics → determine level → update if changed.
   * Returns the new level (or current level if unchanged).
   */
  async evaluateAndUpdateUser(userId: string): Promise<TradingLevel | null> {
    try {
      const metrics = await this.calculateUserMetrics(userId);
      if (!metrics) return null;

      const newLevel = this.determineTradingLevel(metrics);

      // Fetch current level to avoid unnecessary writes
      const user = await UserModel.findById(userId).select('tradingLevel name email').lean();
      if (!user) return null;

      const currentLevel = user.tradingLevel || 'BEGINNER';

      if (newLevel !== currentLevel) {
        await UserModel.findByIdAndUpdate(userId, { tradingLevel: newLevel });
        console.log(
          `[TradingLevel] 🏆 ${user.name || user.email} upgraded: ${currentLevel} → ${newLevel} | ` +
          `Trades: ${metrics.closedTradeCount}, Days: ${metrics.distinctActiveDays}, ` +
          `ROI: ${metrics.absoluteROI}%, Drawdown: ${metrics.maxDrawdown}%, WinRate: ${metrics.winRate}%`
        );
      }

      return newLevel;
    } catch (error) {
      console.error(`[TradingLevel] Error evaluating user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Batch processor for the daily cron job.
   * Queries all users who have at least 1 executed SELL trade,
   * then evaluates each one.
   */
  async evaluateAllActiveUsers(): Promise<void> {
    try {
      console.log('[TradingLevel] ⏳ Starting daily trading level evaluation...');
      const startTime = Date.now();

      // Find all distinct userIds that have at least one executed SELL trade
      const activeUserIds: mongoose.Types.ObjectId[] = await PaperTradeModel.distinct('userId', {
        status: 'EXECUTED',
        type: 'SELL',
      });

      console.log(`[TradingLevel] Found ${activeUserIds.length} users with closed positions to evaluate.`);

      let upgraded = 0;
      let processed = 0;

      for (const userId of activeUserIds) {
        const userIdStr = userId.toString();

        // Get current level before evaluation
        const userBefore = await UserModel.findById(userIdStr).select('tradingLevel').lean();
        const levelBefore = userBefore?.tradingLevel || 'BEGINNER';

        const newLevel = await this.evaluateAndUpdateUser(userIdStr);

        if (newLevel && newLevel !== levelBefore) {
          upgraded++;
        }
        processed++;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `[TradingLevel] ✅ Evaluation complete in ${elapsed}s — ` +
        `Processed: ${processed}, Upgraded: ${upgraded}`
      );
    } catch (error) {
      console.error('[TradingLevel] ❌ Error in batch evaluation:', error);
    }
  }
}

export default new TradingLevelService();
