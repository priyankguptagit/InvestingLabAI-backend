import { Request, Response } from 'express';
import StockData from '../models/stockData';
import StockHistory from '../models/stockHistory';
import DailySnapshot from '../models/DailySnapshot';
import cronService from '../services/cronService';
import stockScraperService from '../services/stockScraper';
import { getISTMidnightUTC, isISTMarketOpen } from '../utils/dateUtils';

// ✨ NEW: Search stocks by symbol / name for autocomplete
export const searchStocks = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || (q as string).trim().length < 1) {
      return res.status(400).json({ success: false, message: 'Query parameter q is required' });
    }

    const searchTerm = (q as string).trim();

    // With upsert, there's only 1 doc per stock — simple find with regex
    const results = await StockData.find({
      $or: [
        { symbol: { $regex: searchTerm, $options: 'i' } },
        { name: { $regex: searchTerm, $options: 'i' } }
      ]
    })
      .select('symbol name price change changePercent category')
      .limit(10)
      .lean();

    res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error searching stocks', error: error.message });
  }
};

export const getStockData = async (req: Request, res: Response) => {
  try {
    const { category, subCategory, limit = 50 } = req.query;

    const query: any = {};
    if (category) {
      query.category = category;
    }
    if (subCategory) {
      query.subCategory = subCategory;
    }
    const stocks = await StockData.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit as string))
      .lean();

    res.status(200).json({
      success: true,
      count: stocks.length,
      data: stocks
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching stock data',
      error: error.message
    });
  }
};

export const getLatestStockData = async (req: Request, res: Response) => {
  try {
    const { category, subCategory } = req.query;

    // With upsert, there's only 1 doc per stock — simple find()
    const query: any = {};
    if (category) query.category = category;
    if (subCategory) query.subCategory = subCategory;

    const stocks = await StockData.find(query)
      .sort({ changePercent: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: stocks.length,
      data: stocks,
      lastUpdated: stocks[0]?.timestamp || new Date()
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching latest stock data',
      error: error.message
    });
  }
};

export const getStockBySymbol = async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;

    // With upsert, there's only 1 doc per symbol — no need for sort
    const stock = await StockData.findOne({ symbol }).lean();

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: 'Stock not found'
      });
    }

    res.status(200).json({
      success: true,
      data: stock
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching stock',
      error: error.message
    });
  }
};

// isMarketOpen is now handled by the shared dateUtils helper (isISTMarketOpen)
// which uses pure UTC arithmetic and is safe on any server timezone.

export const getStockHistory = async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const { range = '1d' } = req.query;

    const today = getISTMidnightUTC();
    const marketOpen = isISTMarketOpen();

    let intradayData: any[] = [];
    let snapshots: any[] = [];

    // ─── 1D: FULL day's minute-by-minute intraday data ────────────────
    // Strategy: Fetch the complete day's chart from NSE's chart API
    // (which has ALL minute data regardless of our server uptime),
    // then merge with our own richer StockHistory records.
    if (range === '1d') {
      // Fetch both sources in parallel for speed
      const [nseChart, ourIntraday] = await Promise.all([
        stockScraperService.fetchIntradayChart(symbol).catch(() => [] as any[]),
        StockHistory.find({ symbol, type: 'intraday', date: today })
          .sort({ timestamp: 1 }).lean()
      ]);

      if (nseChart.length > 0) {
        // Build a lookup map of our scraped data keyed by minute
        // (rounded to nearest minute so timestamps align)
        const ourDataByMinute = new Map<number, any>();
        ourIntraday.forEach((d: any) => {
          const minuteKey = Math.floor(new Date(d.timestamp).getTime() / 60000);
          ourDataByMinute.set(minuteKey, d);
        });

        // Merge: for each NSE data point, use our richer record if available
        // (our records have open/high/low/volume), otherwise use NSE price-only
        intradayData = nseChart.map((nsePoint: any) => {
          const minuteKey = Math.floor(new Date(nsePoint.timestamp).getTime() / 60000);
          const ourRecord = ourDataByMinute.get(minuteKey);

          if (ourRecord) {
            return ourRecord; // Full data: price, open, high, low, volume, etc.
          }

          // NSE-only data point (server was offline at this time)
          return {
            symbol,
            type: 'intraday',
            price: nsePoint.price,
            timestamp: nsePoint.timestamp,
            date: today,
            open: null,
            high: null,
            low: null,
            previousClose: null,
            change: null,
            changePercent: null,
            volume: null,
            marketCap: null
          };
        });
      } else {
        // NSE chart API failed — fall back to our own data
        intradayData = ourIntraday;
      }

      // If STILL no data (weekend/holiday/no data at all), show last available session
      if (intradayData.length === 0) {
        const lastRecord = await StockHistory.findOne({
          symbol, type: 'intraday'
        }).sort({ date: -1 }).lean();

        if (lastRecord) {
          intradayData = await StockHistory.find({
            symbol, type: 'intraday', date: lastRecord.date
          }).sort({ timestamp: 1 }).lean();
        }
      }
    }

    // ─── 1W / 1M / 1Y: Daily closing prices from DailySnapshot ─────
    if (range !== '1d') {
      let daysBack = 7;
      if (range === '1m') daysBack = 30;
      if (range === '1y') daysBack = 365;

      const cutoff = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);

      // Query DailySnapshot — includes both sealed (isClosed=true) and live (isClosed=false) records.
      // Today's live snapshot (if market is open) will naturally appear as the last data point.
      snapshots = await DailySnapshot.find({
        symbol,
        date: { $gte: cutoff }
      }).sort({ date: 1 }).lean();

      // Edge case: if today has no DailySnapshot yet (server just started, first scrape hasn't run),
      // synthesize a data point from the live StockData cache so the chart isn't missing today.
      const hasTodaySnapshot = snapshots.some((s: any) => new Date(s.date).getTime() === today.getTime());
      if (!hasTodaySnapshot && marketOpen) {
        const liveStock = await StockData.findOne({ symbol }).lean();
        if (liveStock) {
          snapshots.push({
            symbol: liveStock.symbol,
            name: liveStock.name,
            category: liveStock.category,
            date: today,
            price: liveStock.price,
            open: liveStock.open,
            high: liveStock.high,
            low: liveStock.low,
            previousClose: liveStock.previousClose,
            change: liveStock.change,
            changePercent: liveStock.changePercent,
            volume: liveStock.volume,
            marketCap: liveStock.marketCap,
            isClosed: false,
            _synthetic: true
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        intraday: intradayData,
        snapshots: snapshots
      },
      isMarketOpen: marketOpen,
      range
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching stock history',
      error: error.message
    });
  }
};

export const manualScrape = async (req: Request, res: Response) => {
  try {
    await cronService.runScraperNow();

    res.status(200).json({
      success: true,
      message: 'Manual scraping initiated'
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error triggering manual scrape',
      error: error.message
    });
  }
};

export const getScraperStatus = async (req: Request, res: Response) => {
  try {
    const status = cronService.getJobStatus();

    const lastUpdate = await StockData.findOne()
      .sort({ timestamp: -1 })
      .select('timestamp')
      .lean();

    res.status(200).json({
      success: true,
      status,
      lastUpdate: lastUpdate?.timestamp || null
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error getting scraper status',
      error: error.message
    });
  }
};

// ✅ NEW: Clear all stock data (useful for debugging/resetting)
export const clearStockData = async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    const query: any = {};
    if (category) {
      query.category = category;
    }

    const result = await StockData.deleteMany(query);

    res.status(200).json({
      success: true,
      message: `Cleared ${result.deletedCount} stock records`,
      deletedCount: result.deletedCount
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error clearing stock data',
      error: error.message
    });
  }
};

// Manual cleanup: compacts past-day intraday → DailySnapshot, then deletes intraday.
// Returns a before/after count so you can confirm how many records were cleaned.
export const manualCleanup = async (req: Request, res: Response) => {
  try {
    const todayIST = getISTMidnightUTC();

    // Count before
    const beforeCount = await StockHistory.countDocuments({
      type: 'intraday',
      date: { $lt: todayIST }
    });

    if (beforeCount === 0) {
      return res.status(200).json({
        success: true,
        message: 'Nothing to clean — no past-day intraday records found.',
        deletedCount: 0
      });
    }

    // Run the same logic as the periodic cleanup
    await cronService.cleanupPastIntradayRecords();

    // Count after
    const afterCount = await StockHistory.countDocuments({
      type: 'intraday',
      date: { $lt: todayIST }
    });

    res.status(200).json({
      success: true,
      message: `Manual cleanup complete.`,
      deletedCount: beforeCount - afterCount,
      remainingPastIntraday: afterCount
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error running manual cleanup',
      error: error.message
    });
  }
};
