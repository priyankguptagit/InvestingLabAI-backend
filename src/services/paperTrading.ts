import { PaperTradeModel } from '../models/paperTrade';
import PortfolioHolding from '../models/portfolio';
import { UserModel } from '../models/user';
import StockData from '../models/stockData';
import mongoose from 'mongoose';
import tradingLevelService from './tradingLevel';

class PaperTradingService {
  
  // Execute a paper trade
  async executeTrade(
    userId: string,
    symbol: string,
    type: 'BUY' | 'SELL',
    quantity: number,
    orderType: 'MARKET' | 'LIMIT' | 'STOP_LOSS',
    limitPrice?: number,
    stopLossPrice?: number,
    reason?: string
  ) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Get user and validate balance
      const user = await UserModel.findById(userId).session(session);
      if (!user) {
        console.error('User not found with ID:', userId);
        throw new Error('User not found');
      }

      // 2. Get current stock price
      const stockData = await StockData.findOne({ symbol })
        .sort({ timestamp: -1 })
        .session(session);
      
      if (!stockData) throw new Error(`Stock ${symbol} not found`);

      const currentPrice = stockData.price;
      const executionPrice = orderType === 'LIMIT' && limitPrice ? limitPrice : currentPrice;
      const totalAmount = executionPrice * quantity;

      // 3. Validate trade based on type
      if (type === 'BUY') {
        if ((user.virtualBalance || 0) < totalAmount) {
          throw new Error('Insufficient virtual balance');
        }
      } else {
        // For SELL, check if user has enough holdings
        const holding = await PortfolioHolding.findOne({ 
          userId, 
          symbol 
        }).session(session);
        
        if (!holding || holding.quantity < quantity) {
          throw new Error('Insufficient holdings to sell');
        }
      }

      // 4. Create trade record
      const trade = await PaperTradeModel.create([{
        userId,
        symbol,
        stockName: stockData.name,
        type,
        orderType,
        quantity,
        price: executionPrice,
        limitPrice,
        stopLossPrice,
        totalAmount,
        status: 'EXECUTED',
        executedAt: new Date(),
        category: stockData.category,
        tradingSession: new Date().toISOString().split('T')[0],
        reason
      }], { session });

      // 5. Update user balance
      if (type === 'BUY') {
        user.virtualBalance = (user.virtualBalance || 100000) - totalAmount;
      } else {
        user.virtualBalance = (user.virtualBalance || 100000) + totalAmount;
      }
      
      user.totalPaperTradesCount = (user.totalPaperTradesCount || 0) + 1;
      await user.save({ session });

      // 6. Update portfolio
      await this.updatePortfolio(
        userId, 
        symbol, 
        stockData.name,
        type, 
        quantity, 
        executionPrice,
        stockData.category,
        session
      );

      await session.commitTransaction();

      // Non-blocking: re-evaluate trading level after every SELL trade
      if (type === 'SELL') {
        setImmediate(async () => {
          try {
            await tradingLevelService.evaluateAndUpdateUser(userId);
          } catch (err) {
            console.error('[TradingLevel] Background evaluation error:', err);
          }
        });
      }
      
      return {
        success: true,
        trade: trade[0],
        newBalance: user.virtualBalance
      };

    } catch (error: any) {
      await session.abortTransaction();
      console.error('Error in executeTrade:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Update portfolio after trade
  private async updatePortfolio(
    userId: string,
    symbol: string,
    stockName: string,
    type: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    category: string,
    session: any
  ) {
    const holding = await PortfolioHolding.findOne({ userId, symbol }).session(session);

    if (type === 'BUY') {
      if (holding) {
        // Update existing holding - calculate new average
        const totalQuantity = holding.quantity + quantity;
        const totalInvested = holding.totalInvested + (price * quantity);
        const newAverage = totalInvested / totalQuantity;

        holding.quantity = totalQuantity;
        holding.averageBuyPrice = newAverage;
        holding.totalInvested = totalInvested;
        holding.currentPrice = price;
        holding.currentValue = price * totalQuantity;
        holding.unrealizedPL = (price - newAverage) * totalQuantity;
        holding.unrealizedPLPercent = ((price - newAverage) / newAverage) * 100;
        holding.lastUpdated = new Date();
        
        await holding.save({ session });
      } else {
        // Create new holding
        await PortfolioHolding.create([{
          userId,
          symbol,
          stockName,
          quantity,
          averageBuyPrice: price,
          totalInvested: price * quantity,
          currentPrice: price,
          currentValue: price * quantity,
          unrealizedPL: 0,
          unrealizedPLPercent: 0,
          category,
          lastUpdated: new Date()
        }], { session });
      }
    } else {
      // SELL
      if (holding) {
        const newQuantity = holding.quantity - quantity;
        
        if (newQuantity === 0) {
          // Sold all holdings
          await PortfolioHolding.deleteOne({ userId, symbol }).session(session);
        } else {
          // Partial sell
          const soldValue = price * quantity;
          const avgCost = holding.averageBuyPrice * quantity;
          const realizedPL = soldValue - avgCost;

          holding.quantity = newQuantity;
          holding.totalInvested = holding.averageBuyPrice * newQuantity;
          holding.currentPrice = price;
          holding.currentValue = price * newQuantity;
          holding.unrealizedPL = (price - holding.averageBuyPrice) * newQuantity;
          holding.unrealizedPLPercent = ((price - holding.averageBuyPrice) / holding.averageBuyPrice) * 100;
          holding.lastUpdated = new Date();
          
          await holding.save({ session });

          // Update user's total P&L
          await UserModel.findByIdAndUpdate(userId, {
            $inc: { totalPaperPL: realizedPL }
          }, { session });
        }
      }
    }
  }

  // Get user's trade history
  async getTradeHistory(
    userId: string, 
    filters?: {
      symbol?: string;
      type?: 'BUY' | 'SELL';
      status?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      skip?: number;
    }
  ) {
    try {
      const query: any = { userId };
      
      if (filters?.symbol) query.symbol = filters.symbol;
      if (filters?.type) query.type = filters.type;
      if (filters?.status) query.status = filters.status;
      if (filters?.startDate || filters?.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = filters.startDate;
        if (filters.endDate) query.createdAt.$lte = filters.endDate;
      }

      const trades = await PaperTradeModel.find(query)
        .sort({ createdAt: -1 })
        .limit(filters?.limit || 50)
        .skip(filters?.skip || 0)
        .lean();

      const total = await PaperTradeModel.countDocuments(query);

      return {
        trades,
        total,
        page: Math.floor((filters?.skip || 0) / (filters?.limit || 50)) + 1,
        totalPages: Math.ceil(total / (filters?.limit || 50))
      };
    } catch (error: any) {
      console.error('Error in getTradeHistory:', error);
      throw error;
    }
  }

  // Get user's portfolio
  async getPortfolio(userId: string) {
    try {
      // 1. Fetch the user to get the real-time balance
      const user = await UserModel.findById(userId).select('virtualBalance').lean();
      
      // 2. Fetch holdings
      const holdings = await PortfolioHolding.find({ userId })
        .sort({ currentValue: -1 })
        .lean();

      // Update current prices for all holdings
      const updatedHoldings = await Promise.all(
        holdings.map(async (holding) => {
          try {
            const latestStock = await StockData.findOne({ symbol: holding.symbol })
              .sort({ timestamp: -1 })
              .lean();
            
            if (latestStock) {
              const currentPrice = latestStock.price;
              const currentValue = currentPrice * holding.quantity;
              const unrealizedPL = (currentPrice - holding.averageBuyPrice) * holding.quantity;
              const unrealizedPLPercent = ((currentPrice - holding.averageBuyPrice) / holding.averageBuyPrice) * 100;

              // Update in database
              await PortfolioHolding.updateOne(
                { _id: holding._id },
                {
                  currentPrice,
                  currentValue,
                  unrealizedPL,
                  unrealizedPLPercent,
                  lastUpdated: new Date()
                }
              );

              return {
                ...holding,
                currentPrice,
                currentValue,
                unrealizedPL,
                unrealizedPLPercent
              };
            }
          } catch (error) {
            console.error(`Error updating price for ${holding.symbol}:`, error);
          }
          
          // Return existing data if update fails
          return holding;
        })
      );

      // Calculate portfolio summary
      const totalInvested = updatedHoldings.reduce((sum, h) => sum + h.totalInvested, 0);
      const currentValue = updatedHoldings.reduce((sum, h) => sum + h.currentValue, 0);
      const totalPL = currentValue - totalInvested;
      const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

      // 3. Return combined data (Balance + Holdings)
      return {
        // Add the retrieved balance here. Default to 100000 if user not found/balance missing.
        availableBalance: user?.virtualBalance ?? 100000, 
        
        holdings: updatedHoldings,
        summary: {
          totalHoldings: updatedHoldings.length,
          totalInvested,
          currentValue,
          totalPL,
          totalPLPercent,
          profitableStocks: updatedHoldings.filter(h => h.unrealizedPL > 0).length,
          losingStocks: updatedHoldings.filter(h => h.unrealizedPL < 0).length
        },
        // Also useful to return total Account Value (Cash + Stock Value)
        totalValue: (user?.virtualBalance ?? 100000) + currentValue
      };
    } catch (error: any) {
      console.error('Error in getPortfolio:', error);
      throw error;
    }
  }

  // Get trading statistics
  async getTradingStats(userId: string) {
    try {
      console.log('getTradingStats called with userId:', userId);
      
      const user = await UserModel.findById(userId);
      
      if (!user) {
        console.error('User not found in database with ID:', userId);
        throw new Error('User not found');
      }

      console.log('User found:', user.email);

      const totalTrades = await PaperTradeModel.countDocuments({ userId });
      const buyTrades = await PaperTradeModel.countDocuments({ userId, type: 'BUY' });
      const sellTrades = await PaperTradeModel.countDocuments({ userId, type: 'SELL' });

      // Get portfolio summary using CACHED prices (no live fetching for stats)
      const holdings = await PortfolioHolding.find({ userId }).lean();
      
      const portfolioSummary = {
        totalInvested: holdings.reduce((sum, h) => sum + h.totalInvested, 0),
        currentValue: holdings.reduce((sum, h) => sum + h.currentValue, 0),
        totalPL: holdings.reduce((sum, h) => sum + h.unrealizedPL, 0)
      };
      
      const profitLoss = (user.totalPaperPL || 0) + portfolioSummary.totalPL;
      const profitLossPercent = (user.initialVirtualBalance || 100000) > 0 
        ? (profitLoss / (user.initialVirtualBalance || 100000)) * 100 
        : 0;

      return {
        virtualBalance: user.virtualBalance || 100000,
        initialBalance: user.initialVirtualBalance || 100000,
        currentPortfolioValue: portfolioSummary.currentValue,
        totalInvested: portfolioSummary.totalInvested,
        availableCash: user.virtualBalance || 100000,
        totalAccountValue: (user.virtualBalance || 100000) + portfolioSummary.currentValue,
        totalProfitLoss: profitLoss,
        totalProfitLossPercent: profitLossPercent,
        totalTrades,
        buyTrades,
        sellTrades,
        profitableTrades: user.profitablePaperTrades || 0,
        winRate: totalTrades > 0 ? ((user.profitablePaperTrades || 0) / totalTrades) * 100 : 0,
        tradingLevel: user.tradingLevel || 'BEGINNER',
        bestTrade: user.bestPaperTrade || 0,
        worstTrade: user.worstPaperTrade || 0
      };
    } catch (error: any) {
      console.error('Error in getTradingStats:', error);
      throw error;
    }
  }

  // Reset virtual balance
  async resetVirtualBalance(userId: string, newBalance: number = 100000) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Clear all portfolio holdings
      await PortfolioHolding.deleteMany({ userId }).session(session);

      // Reset user balance and stats
      await UserModel.findByIdAndUpdate(userId, {
        virtualBalance: newBalance,
        initialVirtualBalance: newBalance,
        virtualBalanceLastReset: new Date(),
        totalPaperTradesCount: 0,
        profitablePaperTrades: 0,
        totalPaperPL: 0,
        bestPaperTrade: 0,
        worstPaperTrade: 0
      }, { session });

      await session.commitTransaction();
      
      return { success: true, newBalance };
    } catch (error) {
      await session.abortTransaction();
      console.error('Error in resetVirtualBalance:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
}

export default new PaperTradingService();