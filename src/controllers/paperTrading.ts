import { Request, Response } from 'express';
import paperTradingService from '../services/paperTrading';
import aiTradingService from '../services/aiTrading';
import { UserModel } from '../models/user';
import { OrganizationModel } from '../models/organization';
import { getEffectivePlan } from '../utils/getEffectivePlan';
import { getPlanLimits } from '../config/plans';
import { PaperTradeModel } from '../models/paperTrade';
import DailySnapshot from '../models/DailySnapshot';

// ✨ Helper to extract userId from token (supports both "id" and "userId")
const getUserId = (req: Request): string => {
  const user = (req as any).user;
  const userId = user?.userId || user?.id;
  console.log('🔍 Extracting userId:', { userId: user?.userId, id: user?.id, extracted: userId });
  return userId || '';
};

// ✨ Helper to extract auth token from cookies or Authorization header
const getAuthToken = (req: Request): string => {
  // 1. Try cookie first (how the frontend sends it)
  let token = req.cookies?.accessToken;
  // 2. Fallback to Authorization header
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization
      : `Bearer ${req.headers.authorization}`;
  } else if (token) {
    token = `Bearer ${token}`;
  }
  return token || '';
};

// Execute a paper trade
export const executePaperTrade = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const {
      symbol,
      type,
      quantity,
      orderType = 'MARKET',
      limitPrice,
      stopLossPrice,
      reason
    } = req.body;

    // Validation
    if (!symbol || !type || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: symbol, type, quantity'
      });
    }

    // --- ENFORCE PLAN LIMITS ---
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let org = null;
    if (user.organization && user.organizationApprovalStatus === 'approved') {
      org = await OrganizationModel.findById(user.organization);
    }

    const plan = getEffectivePlan(user as any, org);
    const limits = getPlanLimits(plan);

    if (!limits.canPaperTrade) {
      return res.status(403).json({
        success: false,
        message: `Paper trading is not available on the ${plan} plan. Please upgrade to Silver, Gold, or Diamond.`
      });
    }
    // ---------------------------

    if (!['BUY', 'SELL'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be either BUY or SELL'
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0'
      });
    }

    // Validate reason/thesis (required for all trades, min 50 characters)
    if (!reason || typeof reason !== 'string' || reason.trim().length < 50) {
      return res.status(400).json({
        success: false,
        message: 'A trading reason/thesis is required (minimum 50 characters)'
      });
    }

    // Get AI recommendation before trade (optional)
    let aiAnalysis = null;
    try {
      const authToken = getAuthToken(req);
      aiAnalysis = await aiTradingService.getStockAnalysis(symbol, userId, authToken);
    } catch (error) {
      console.log('AI analysis failed, proceeding with trade');
    }

    // Execute trade
    const result = await paperTradingService.executeTrade(
      userId,
      symbol.toUpperCase(),
      type,
      quantity,
      orderType,
      limitPrice,
      stopLossPrice,
      reason.trim()
    );

    res.status(200).json({
      success: true,
      message: `${type} order executed successfully`,
      data: {
        ...result,
        aiRecommendation: aiAnalysis
      }
    });

  } catch (error: any) {
    console.error('Execute Trade Error:', error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to execute trade'
    });
  }
};

// Get trade history
export const getTradeHistory = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const {
      symbol,
      type,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const filters: any = {};
    if (symbol) filters.symbol = (symbol as string).toUpperCase();
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    filters.limit = parseInt(limit as string);
    filters.skip = (parseInt(page as string) - 1) * filters.limit;

    const result = await paperTradingService.getTradeHistory(userId, filters);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('Get Trade History Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trade history'
    });
  }
};

// Get portfolio
export const getPortfolio = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const portfolio = await paperTradingService.getPortfolio(userId);

    res.status(200).json({
      success: true,
      data: portfolio
    });

  } catch (error: any) {
    console.error('Get Portfolio Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portfolio'
    });
  }
};

// Get trading statistics
export const getTradingStats = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const stats = await paperTradingService.getTradingStats(userId);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    console.error('Get Trading Stats Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trading statistics'
    });
  }
};

// Get AI stock analysis
export const getAIStockAnalysis = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let org = null;
    if (user.organization && user.organizationApprovalStatus === 'approved') {
      org = await OrganizationModel.findById(user.organization);
    }
    const plan = getEffectivePlan(user as any, org);
    const limits = getPlanLimits(plan);

    if (limits.monthlyNewsAiLimits <= 0) {
      return res.status(403).json({
        success: false,
        message: `AI News Analysis is not available on the ${plan} plan. Please upgrade to Gold or Diamond.`
      });
    }

    // Check if user hit quota
    if ((user.aiNewsUsageCount || 0) >= limits.monthlyNewsAiLimits) {
      return res.status(429).json({
        success: false,
        message: `You have reached your monthly limit of ${limits.monthlyNewsAiLimits} AI News Analysis. Please upgrade your plan for more.`
      });
    }

    const rawSymbol = req.params.symbol;

    if (!rawSymbol) {
      return res.status(400).json({
        success: false,
        message: "Stock symbol is required",
      });
    }

    // ✅ normalize
    const symbol = Array.isArray(rawSymbol) ? rawSymbol[0] : rawSymbol;

    const authToken = getAuthToken(req);
    const analysis = await aiTradingService.getStockAnalysis(
      symbol.toUpperCase(),
      userId,
      authToken
    );

    res.status(200).json({
      success: true,
      data: analysis
    });

  } catch (error: any) {
    console.error('AI Analysis Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI analysis'
    });
  }
};

// Get AI portfolio analysis
export const getAIPortfolioAnalysis = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let org = null;
    if (user.organization && user.organizationApprovalStatus === 'approved') {
      org = await OrganizationModel.findById(user.organization);
    }
    const plan = getEffectivePlan(user as any, org);
    const limits = getPlanLimits(plan);

    if (limits.monthlyPortfolioAiLimits <= 0) {
      return res.status(403).json({
        success: false,
        message: `AI Portfolio Analysis is not available on the ${plan} plan. Please upgrade to Gold or Diamond.`
      });
    }

    if ((user.aiPortfolioUsageCount || 0) >= limits.monthlyPortfolioAiLimits) {
      return res.status(429).json({
        success: false,
        message: `You have reached your monthly limit of ${limits.monthlyPortfolioAiLimits} AI Portfolio Analysis. Please upgrade your plan for more.`
      });
    }

    const authToken = getAuthToken(req);
    const analysis = await aiTradingService.getPortfolioAnalysis(userId, authToken);

    user.aiPortfolioUsageCount = (user.aiPortfolioUsageCount || 0) + 1;
    await user.save();

    res.status(200).json({
      success: true,
      data: { analysis }
    });

  } catch (error: any) {
    console.error('Portfolio Analysis Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate portfolio analysis'
    });
  }
};

// Get trading insights
export const getTradingInsights = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const authToken = getAuthToken(req);
    const insights = await aiTradingService.getTradingInsights(userId, authToken);

    res.status(200).json({
      success: true,
      data: insights
    });

  } catch (error: any) {
    console.error('Trading Insights Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate trading insights'
    });
  }
};

// Reset virtual balance
export const resetVirtualBalance = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const { newBalance = 100000 } = req.body;

    // ENFORCE BALANCE LIMIT BASED ON PLAN
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let org = null;
    if (user.organization && user.organizationApprovalStatus === 'approved') {
      org = await OrganizationModel.findById(user.organization);
    }

    const plan = getEffectivePlan(user as any, org);
    const limits = getPlanLimits(plan);

    if (!limits.canPaperTrade) {
      return res.status(403).json({
        success: false,
        message: `Paper trading is not available on the ${plan} plan.`
      });
    }

    if (newBalance > limits.maxVirtualBalance) {
      return res.status(400).json({
        success: false,
        message: `Maximum allowed balance for ${plan} plan is ${limits.maxVirtualBalance.toLocaleString()}.`
      });
    }

    const result = await paperTradingService.resetVirtualBalance(userId, newBalance);

    res.status(200).json({
      success: true,
      message: 'Virtual balance reset successfully',
      data: result
    });

  } catch (error: any) {
    console.error('Reset Balance Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to reset virtual balance'
    });
  }
};

// Get stock news + AI recommendation based on news
export const getStockNewsAndAIRecommendation = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let org = null;
    if (user.organization && user.organizationApprovalStatus === 'approved') {
      org = await OrganizationModel.findById(user.organization);
    }
    const plan = getEffectivePlan(user as any, org);
    const limits = getPlanLimits(plan);

    if (limits.monthlyNewsAiLimits <= 0) {
      return res.status(403).json({
        success: false,
        message: `AI News recommendations are not available on the ${plan} plan. Please upgrade to Gold or Diamond.`
      });
    }

    if ((user.aiNewsUsageCount || 0) >= limits.monthlyNewsAiLimits) {
      return res.status(429).json({
        success: false,
        message: `You have reached your monthly limit of ${limits.monthlyNewsAiLimits} AI News Analysis. Please upgrade your plan for more.`
      });
    }

    const rawSymbol = req.params.symbol;
    if (!rawSymbol) {
      return res.status(400).json({ success: false, message: 'Stock symbol is required' });
    }

    const symbol = (Array.isArray(rawSymbol) ? rawSymbol[0] : rawSymbol).toUpperCase();

    // 1. Get the stock details to know its name/sector
    const StockData = (await import('../models/stockData')).default;
    const NewsData = (await import('../models/newsData')).default;

    const stock = await StockData.findOne({ symbol }).sort({ timestamp: -1 }).lean() as any;
    const stockName = stock?.name || symbol;

    // 2. Fetch news specific to this symbol
    let newsItems: any[] = await NewsData.find({ relatedSymbols: symbol })
      .sort({ publishedAt: -1 })
      .limit(8)
      .lean();

    // 3. If not enough specific news, fall back to sector-related keyword search
    if (newsItems.length < 3) {
      const sectorKeywords = getSectorKeywords(symbol, stockName);

      const sectorQuery: any = {
        $or: sectorKeywords.map(kw => ({
          title: { $regex: kw, $options: 'i' }
        }))
      };

      const sectorNews = await NewsData.find(sectorQuery)
        .sort({ publishedAt: -1 })
        .limit(8 - newsItems.length)
        .lean();

      newsItems = [...newsItems, ...sectorNews];
    }

    // 4. Final fallback: get latest general market/stocks news
    if (newsItems.length < 2) {
      const generalNews = await NewsData.find({ category: { $in: ['MARKET', 'STOCKS', 'ECONOMY'] } })
        .sort({ publishedAt: -1 })
        .limit(6)
        .lean();
      newsItems = [...newsItems, ...generalNews];
    }

    // 5. Get AI recommendation based on the gathered news
    const authToken = getAuthToken(req);
    const aiRecommendation = await aiTradingService.getNewsBasedRecommendation(
      symbol,
      stockName,
      newsItems as any,
      userId,
      authToken
    );

    res.status(200).json({
      success: true,
      data: {
        symbol,
        stockName,
        news: newsItems,
        aiRecommendation,
        newsFallbackUsed: newsItems.some((n: any) => !n.relatedSymbols?.includes(symbol))
      }
    });

  } catch (error: any) {
    console.error('Stock News + AI Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch news and recommendation' });
  }
};

// Helper: Extract sector-related search keywords from a stock's symbol/name
function getSectorKeywords(symbol: string, stockName: string): string[] {
  const name = stockName.toLowerCase();
  const sym = symbol.toLowerCase();
  const keywords: string[] = [symbol];

  // IT / Technology
  if (['tcs', 'infy', 'wipro', 'hcltech', 'techm', 'ltim', 'mphasis', 'persistent', 'coforge'].some(s => sym.includes(s))) {
    keywords.push('IT', 'technology', 'software', 'digital', 'outsourcing', 'tech sector');
  }
  // Banking / Financial
  else if (['hdfcbank', 'icicibank', 'sbin', 'axisbank', 'kotak', 'indusind', 'bajfinance'].some(s => sym.includes(s))) {
    keywords.push('bank', 'banking', 'RBI', 'interest rate', 'credit', 'financial');
  }
  // Energy / Oil
  else if (['reliance', 'ongc', 'bpcl', 'iocl', 'hindpetro', 'powergrid', 'ntpc', 'adani'].some(s => sym.includes(s))) {
    keywords.push('oil', 'energy', 'crude', 'petroleum', 'power', 'renewable');
  }
  // Pharma
  else if (['sunpharma', 'drreddy', 'cipla', 'divislab', 'auropharma', 'lupin'].some(s => sym.includes(s))) {
    keywords.push('pharma', 'pharmaceutical', 'drug', 'healthcare', 'FDA', 'USFDA');
  }
  // Auto
  else if (['maruti', 'tatamotors', 'heromotoco', 'bajaj', 'eichermot', 'mahindra'].some(s => sym.includes(s))) {
    keywords.push('automobile', 'auto', 'EV', 'electric vehicle', 'vehicle');
  }
  // Metals
  else if (['tatasteel', 'jswsteel', 'hindalco', 'vedanta', 'nmdc', 'sail'].some(s => sym.includes(s))) {
    keywords.push('steel', 'metal', 'aluminium', 'mining', 'commodity');
  }
  // FMCG
  else if (['itc', 'hindunilvr', 'nestleind', 'britannia', 'dabur', 'marico'].some(s => sym.includes(s))) {
    keywords.push('FMCG', 'consumer goods', 'retail', 'demand');
  }
  // ETF / Indices
  else if (name.includes('nifty') || name.includes('etf') || name.includes('bees')) {
    keywords.push('Nifty', 'market', 'index', 'sensex', 'NSE');
  }
  // Generic
  else {
    const words = stockName.split(' ').filter(w => w.length > 3);
    keywords.push(...words.slice(0, 3), 'market', 'stock');
  }

  return [...new Set(keywords)];
}


// ─── Portfolio Chart History ───────────────────────────────────────────────
// GET /api/paper-trading/portfolio-chart?range=1w|1m|3m|1y
// Returns a real time-series of portfolio P&L% alongside price-based cumulative
// returns for Nifty50/100/500 indices — zero synthetic data.
export const getPortfolioChart = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const range = (req.query.range as string) || '1w';

    // ── 1. Date window ────────────────────────────────────────────────────────
    const now = new Date();
    let daysBack = 7;
    if (range === '1m') daysBack = 30;
    else if (range === '3m') daysBack = 90;
    else if (range === '1y') daysBack = 365;

    const windowStart = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // ── 2. User's first trade (to constrain portfolio series to real history) ─
    const firstTrade = await PaperTradeModel.findOne({ userId, status: 'EXECUTED' })
      .sort({ executedAt: 1 }).lean();

    // The portfolio series only starts from the first trade or window start, whichever is later
    const portfolioStart = firstTrade?.executedAt
      ? new Date(Math.max(firstTrade.executedAt.getTime(), windowStart.getTime()))
      : null;

    // ── 3. Portfolio P&L series — cash + stock values per day ─────────────────
    let portfolioSeries: { date: string; pct: number }[] = [];

    if (portfolioStart) {
      const user = await UserModel.findById(userId)
        .select('initialVirtualBalance').lean();
      const initialBalance = (user as any)?.initialVirtualBalance || 100000;

      // All EXECUTED trades (from very first, to replay state per-day)
      const allTrades = await PaperTradeModel.find({ userId, status: 'EXECUTED' })
        .sort({ executedAt: 1 }).lean();

      // All unique symbols ever traded — for batch DailySnapshot lookup
      const tradedSymbols = [...new Set(allTrades.map(t => t.symbol))];

      // Batch-fetch all DailySnapshot prices for traded symbols in range
      const holdingSnaps = await DailySnapshot.find({
        symbol: { $in: tradedSymbols },
        date: { $gte: portfolioStart }
      }).lean();

      // Build lookup: symbol → date → price
      const priceMap = new Map<string, Map<string, number>>();
      holdingSnaps.forEach((snap: any) => {
        const dateStr = new Date(snap.date).toISOString().split('T')[0];
        if (!priceMap.has(snap.symbol)) priceMap.set(snap.symbol, new Map());
        priceMap.get(snap.symbol)!.set(dateStr, snap.price);
      });

      // Last-known price fallback (from trade execution prices)
      const lastKnownPrice = new Map<string, number>();
      allTrades.forEach(t => { lastKnownPrice.set(t.symbol, t.price); });

      // Generate calendar days in [portfolioStart, today]
      const days: Date[] = [];
      const cursor = new Date(portfolioStart);
      cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(now);
      endDay.setHours(23, 59, 59, 999);
      while (cursor <= endDay) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }

      // Replay trades day by day, track holdings and cash
      let runningCash = initialBalance;
      const runningHoldings = new Map<string, number>(); // symbol → quantity
      let tradeIdx = 0;

      const rawSeries: ({ date: string; pct: number } | null)[] = days.map(day => {
        const dayStr = day.toISOString().split('T')[0];
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        // Apply all trades up to end of this day
        while (
          tradeIdx < allTrades.length &&
          new Date(allTrades[tradeIdx].executedAt!).getTime() <= dayEnd.getTime()
        ) {
          const t = allTrades[tradeIdx];
          if (t.type === 'BUY') {
            runningCash -= t.totalAmount;
            runningHoldings.set(t.symbol, (runningHoldings.get(t.symbol) || 0) + t.quantity);
          } else {
            runningCash += t.totalAmount;
            const newQty = (runningHoldings.get(t.symbol) || 0) - t.quantity;
            if (newQty <= 0) runningHoldings.delete(t.symbol);
            else runningHoldings.set(t.symbol, newQty);
          }
          lastKnownPrice.set(allTrades[tradeIdx].symbol, allTrades[tradeIdx].price);
          tradeIdx++;
        }

        // ── Skip days with no active holdings ──────────────────────────────────
        // If the user has sold all their stocks, there's nothing meaningful to
        // show on the chart — cash sitting idle = 0% which is visually misleading.
        if (runningHoldings.size === 0) return null;

        // ── Skip days where no holding has a real snapshot price ───────────────
        // Without a real market price we would fall back to the buy price,
        // which always gives exactly 0% P&L (flat line). Skip instead.
        const hasAnyRealPrice = [...runningHoldings.keys()].some(
          symbol => priceMap.get(symbol)?.has(dayStr)
        );
        if (!hasAnyRealPrice) return null;

        // Compute stock value — snapshot price first, last trade price as fallback
        let stockValue = 0;
        runningHoldings.forEach((qty, symbol) => {
          const dayPrice =
            priceMap.get(symbol)?.get(dayStr) ??
            lastKnownPrice.get(symbol) ??
            0;
          stockValue += dayPrice * qty;
        });

        const totalValue = runningCash + stockValue;
        const pct = ((totalValue - initialBalance) / initialBalance) * 100;
        return { date: dayStr, pct: parseFloat(pct.toFixed(3)) };
      });

      portfolioSeries = rawSeries.filter(Boolean) as { date: string; pct: number }[];
    }

    // ── 4. Index series: price-ratio cumulative return ─────────────────────────
    // All symbols are anchored to the SAME first date that has broad coverage,
    // so the cumulative return is comparable across the whole basket.
    // Days with fewer than 20% of symbols are skipped to prevent broken segments.
    const computeIndexSeries = (snaps: any[]): { date: string; pct: number }[] => {
      if (!snaps.length) return [];

      // Group by symbol → sorted {date, price}
      const bySymbol = new Map<string, { date: string; price: number }[]>();
      snaps.forEach((s: any) => {
        const d = new Date(s.date).toISOString().split('T')[0];
        if (!bySymbol.has(s.symbol)) bySymbol.set(s.symbol, []);
        bySymbol.get(s.symbol)!.push({ date: d, price: s.price });
      });

      const totalSymbols = bySymbol.size;
      const minSymbolsPerDay = Math.max(3, Math.floor(totalSymbols * 0.20));

      // ── Find the shared anchor date: the EARLIEST day that has broad coverage
      // This ensures all symbols are compared from the same starting point.
      const dateSymbolCount = new Map<string, number>();
      bySymbol.forEach(entries => {
        entries.forEach(({ date }) => {
          dateSymbolCount.set(date, (dateSymbolCount.get(date) || 0) + 1);
        });
      });
      const anchorDate = [...dateSymbolCount.entries()]
        .filter(([, count]) => count >= minSymbolsPerDay)
        .sort((a, b) => a[0].localeCompare(b[0]))
        [0]?.[0];

      if (!anchorDate) return []; // no day has enough coverage

      // Build symbol → anchor price (price on anchorDate, skip symbols missing it)
      const anchorPrice = new Map<string, number>();
      bySymbol.forEach((entries, symbol) => {
        const anchorEntry = entries.find(e => e.date === anchorDate);
        if (anchorEntry && anchorEntry.price > 0) {
          anchorPrice.set(symbol, anchorEntry.price);
        }
      });

      // Compute returns relative to the shared anchor date
      const dailyReturns = new Map<string, number[]>();
      bySymbol.forEach((entries, symbol) => {
        const base = anchorPrice.get(symbol);
        if (!base) return; // symbol had no data on anchor date, exclude it
        entries
          .filter(e => e.date >= anchorDate) // only dates at or after anchor
          .forEach(({ date, price }) => {
            const ret = ((price - base) / base) * 100;
            if (!dailyReturns.has(date)) dailyReturns.set(date, []);
            dailyReturns.get(date)!.push(ret);
          });
      });

      // Average across symbols — only emit day if coverage threshold met
      const result: { date: string; pct: number }[] = [];
      dailyReturns.forEach((rets, date) => {
        if (rets.length < minSymbolsPerDay) return;
        const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
        result.push({ date, pct: parseFloat(avg.toFixed(3)) });
      });

      return result.sort((a, b) => a.date.localeCompare(b.date));
    };

    const [n50Snaps, n100Snaps, n500Snaps] = await Promise.all([
      DailySnapshot.find({ category: 'NIFTY50', date: { $gte: windowStart }, price: { $gt: 0 } })
        .sort({ date: 1 }).lean(),
      DailySnapshot.find({ category: 'NIFTY100', date: { $gte: windowStart }, price: { $gt: 0 } })
        .sort({ date: 1 }).lean(),
      DailySnapshot.find({ category: 'NIFTY500', date: { $gte: windowStart }, price: { $gt: 0 } })
        .sort({ date: 1 }).lean(),
    ]);

    const nifty50Series = computeIndexSeries(n50Snaps);
    const nifty100Series = computeIndexSeries(n100Snaps);
    const nifty500Series = computeIndexSeries(n500Snaps);

    // ── 5. Merge on date — null means "no data" for that series on that day ──
    const allDates = new Set<string>();
    portfolioSeries.forEach(p => allDates.add(p.date));
    nifty50Series.forEach(p => allDates.add(p.date));
    nifty100Series.forEach(p => allDates.add(p.date));
    nifty500Series.forEach(p => allDates.add(p.date));

    const toMap = (series: { date: string; pct: number }[]) =>
      new Map(series.map(s => [s.date, s.pct]));

    const pMap = toMap(portfolioSeries);
    const n50Map = toMap(nifty50Series);
    const n100Map = toMap(nifty100Series);
    const n500Map = toMap(nifty500Series);

    const sortedDates = [...allDates].sort();
    const merged = sortedDates.map(date => ({
      date,
      label: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short'
      }),
      portfolio: pMap.has(date) ? pMap.get(date)! : null,
      nifty50: n50Map.has(date) ? n50Map.get(date)! : null,
      nifty100: n100Map.has(date) ? n100Map.get(date)! : null,
      nifty500: n500Map.has(date) ? n500Map.get(date)! : null,
    }));

    // ── 6. Current P&L% for badge display ────────────────────────────────────
    // Use the last point in each series (= cumulative return up to now)
    // so badges reflect the same scale as the chart, not a single-day delta.
    const statsData = await paperTradingService.getTradingStats(userId);

    const lastPct = (series: { date: string; pct: number }[]) =>
      series.length > 0 ? series[series.length - 1].pct : null;

    res.status(200).json({
      success: true,
      data: {
        chartPoints: merged,
        // The effective start date for this view (window-clipped, not all-time first trade)
        portfolioStartDate: portfolioStart ?? null,
        hasPortfolioData: portfolioSeries.length > 0,
        // Period cumulative returns — same scale as the chart lines
        periodPcts: {
          portfolio: portfolioSeries.length > 0
            ? statsData.totalProfitLossPercent  // live unrealized P&L from holdings
            : null,
          nifty50: lastPct(nifty50Series),
          nifty100: lastPct(nifty100Series),
          nifty500: lastPct(nifty500Series),
        },
        range,
      }
    });

  } catch (error: any) {
    console.error('Portfolio Chart Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to build portfolio chart data' });
  }
};
