import axios from 'axios';
import * as cheerio from 'cheerio';
import StockData from '../models/stockData';
import StockHistory from '../models/stockHistory';
import DailySnapshot from '../models/DailySnapshot';
import { getISTMidnightUTC } from '../utils/dateUtils';

class StockScraperService {

  private nseBaseUrl = 'https://www.nseindia.com/api';
  private cookies = ''; // Store the session cookies here

  // Headers must match a real browser EXACTLY
  private headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://www.nseindia.com/market-data/live-equity-market'
  };

  // ✅ FIX 1: Capture and Store Cookies
  async initSession() {
    try {
      const response = await axios.get('https://www.nseindia.com', {
        headers: this.headers
      });

      // Extract cookies from the response headers
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        this.cookies = setCookie.join('; ');
        console.log('✅ NSE Session Initialized with cookies');
      }
    } catch (error) {
      console.error('Failed to initialize NSE session:', error);
    }
  }

  // ✅ FIX 2: Helper to get headers with cookies
  private getAuthHeaders() {
    return {
      ...this.headers,
      'Cookie': this.cookies // Attach the stored cookie
    };
  }

  async scrapeNifty50(): Promise<any[]> {
    try {
      if (!this.cookies) await this.initSession();

      const response = await axios.get(
        `${this.nseBaseUrl}/equity-stockIndices?index=NIFTY%2050`,
        { headers: this.getAuthHeaders() } // Use authenticated headers
      );

      // Validate data structure before mapping
      const stocksData = response.data?.data;
      if (!Array.isArray(stocksData)) {
        // If cookies expired, retry once
        console.log("Session expired, re-initializing...");
        await this.initSession();
        const retryResponse = await axios.get(
          `${this.nseBaseUrl}/equity-stockIndices?index=NIFTY%2050`,
          { headers: this.getAuthHeaders() }
        );
        return this.formatNiftyData(retryResponse.data?.data || []);
      }

      const formattedData = this.formatNiftyData(stocksData);
      console.log(`Scraped ${formattedData.length} Nifty 50 stocks`);
      return formattedData;

    } catch (error: any) {
      console.error('Error scraping Nifty 50:', error.message);
      return [];
    }
  }

  // Extracted formatter for cleanliness
  private formatNiftyData(data: any[]) {
    /**
     * PROFESSIONAL DATA-DRIVEN FILTERING
     * 
     * Instead of hardcoding symbols, we filter based on NSE API metadata:
     * 1. series === 'EQ' means it's an equity stock (not ETF, not index)
     * 2. Exclude the index summary row (symbol === index name like "NIFTY 50")
     * 3. Exclude any non-traded instruments
     * 
     * This approach automatically adapts when the Nifty 50 index changes.
     */
    const filteredData = data.filter((stock: any) => {
      const symbol = (stock.symbol || '').trim();
      const series = (stock.series || '').toUpperCase();

      // Skip the index summary row (NSE returns the index itself as a row)
      if (symbol.includes('NIFTY') || symbol.includes('INDEX')) {
        return false;
      }

      // Only include equity stocks (series = 'EQ')
      // NSE uses 'EQ' for regular equity, 'BE' for trade-to-trade, etc.
      // If series is not provided, we check other indicators
      if (series && series !== 'EQ') {
        return false;
      }

      // Exclude known non-stock instruments by pattern
      // These are ETFs, funds, and other derivative products
      const nonStockPatterns = ['ETF', 'BEES', 'LIQUID', 'GILT', 'GOLD', 'SILVER'];
      if (nonStockPatterns.some(p => symbol.toUpperCase().includes(p))) {
        return false;
      }

      // Must have a valid price (real stocks have prices)
      if (!stock.lastPrice || parseFloat(stock.lastPrice) <= 0) {
        return false;
      }

      return true;
    });

    return filteredData.map((stock: any) => ({
      symbol: stock.symbol,
      name: stock.companyName || stock.meta?.companyName || stock.symbol,
      category: 'NIFTY50',
      price: parseFloat(stock.lastPrice) || 0,
      open: parseFloat(stock.open) || 0,
      high: parseFloat(stock.dayHigh) || 0,
      low: parseFloat(stock.dayLow) || 0,
      previousClose: parseFloat(stock.previousClose) || 0,
      change: parseFloat(stock.change) || 0,
      changePercent: parseFloat(stock.pChange) || 0,
      volume: parseInt(stock.totalTradedVolume) || 0,
      marketCap: parseFloat(stock.totalTradedValue) || 0,
      timestamp: new Date(),
      lastUpdated: new Date()
    }));
  }

  async scrapeNifty100(): Promise<any[]> {
    try {
      if (!this.cookies) await this.initSession();

      const response = await axios.get(
        `${this.nseBaseUrl}/equity-stockIndices?index=NIFTY%20100`,
        { headers: this.getAuthHeaders() }
      );

      // Validate data structure before mapping
      const stocksData = response.data?.data;
      if (!Array.isArray(stocksData)) {
        // If cookies expired, retry once
        console.log("Session expired, re-initializing...");
        await this.initSession();
        const retryResponse = await axios.get(
          `${this.nseBaseUrl}/equity-stockIndices?index=NIFTY%20100`,
          { headers: this.getAuthHeaders() }
        );
        return this.formatNifty100Data(retryResponse.data?.data || []);
      }

      const formattedData = this.formatNifty100Data(stocksData);
      console.log(`Scraped ${formattedData.length} Nifty 100 stocks`);
      return formattedData;

    } catch (error: any) {
      console.error('Error scraping Nifty 100:', error.message);
      return [];
    }
  }

  // Formatter for Nifty100 data
  private formatNifty100Data(data: any[]) {
    return data.map((stock: any) => ({
      symbol: stock.symbol,
      name: stock.companyName || stock.meta?.companyName || stock.symbol,
      category: 'NIFTY100',
      price: parseFloat(stock.lastPrice) || 0,
      open: parseFloat(stock.open) || 0,
      high: parseFloat(stock.dayHigh) || 0,
      low: parseFloat(stock.dayLow) || 0,
      previousClose: parseFloat(stock.previousClose) || 0,
      change: parseFloat(stock.change) || 0,
      changePercent: parseFloat(stock.pChange) || 0,
      volume: parseInt(stock.totalTradedVolume) || 0,
      marketCap: parseFloat(stock.totalTradedValue) || 0,
      timestamp: new Date(),
      lastUpdated: new Date()
    }));
  }

  async scrapeNifty500(): Promise<any[]> {
    try {
      if (!this.cookies) await this.initSession();

      const response = await axios.get(
        `${this.nseBaseUrl}/equity-stockIndices?index=NIFTY%20500`,
        { headers: this.getAuthHeaders() }
      );

      // Validate data structure before mapping
      const stocksData = response.data?.data;
      if (!Array.isArray(stocksData)) {
        // If cookies expired, retry once
        console.log("Session expired, re-initializing...");
        await this.initSession();
        const retryResponse = await axios.get(
          `${this.nseBaseUrl}/equity-stockIndices?index=NIFTY%20500`,
          { headers: this.getAuthHeaders() }
        );
        return this.formatNifty500Data(retryResponse.data?.data || []);
      }

      const formattedData = this.formatNifty500Data(stocksData);
      console.log(`Scraped ${formattedData.length} Nifty 500 stocks`);
      return formattedData;

    } catch (error: any) {
      console.error('Error scraping Nifty 500:', error.message);
      return [];
    }
  }

  private formatNifty500Data(data: any[]) {
    // Re-use logic for extracting the list
    const filteredData = data.filter((stock: any) => {
      const symbol = (stock.symbol || '').trim();
      if (symbol.includes('NIFTY') || symbol.includes('INDEX')) return false;
      if (!stock.lastPrice || parseFloat(stock.lastPrice) <= 0) return false;
      return true;
    });
    return filteredData.map((stock: any) => ({
      symbol: stock.symbol,
      name: stock.meta?.companyName || stock.symbol,
      category: 'NIFTY500',
      price: parseFloat(stock.lastPrice) || 0,
      open: parseFloat(stock.open) || 0,
      high: parseFloat(stock.dayHigh) || 0,
      low: parseFloat(stock.dayLow) || 0,
      previousClose: parseFloat(stock.previousClose) || 0,
      change: parseFloat(stock.change) || 0,
      changePercent: parseFloat(stock.pChange) || 0,
      volume: parseInt(stock.totalTradedVolume) || 0,
      marketCap: parseFloat(stock.totalTradedValue) || 0,
      timestamp: new Date(),
      lastUpdated: new Date()
    }));
  }

  async scrapeETF(): Promise<any[]> {
    try {
      if (!this.cookies) await this.initSession();

      const response = await axios.get(
        `${this.nseBaseUrl}/etf`, // This endpoint is often more stable for ETFs
        { headers: this.getAuthHeaders() }
      );

      // NSE API data structure check
      let etfData = [];
      if (response.data && Array.isArray(response.data.data)) {
        etfData = response.data.data;
      } else if (Array.isArray(response.data)) {
        etfData = response.data;
      } else {
        throw new Error("Invalid ETF data structure received (likely 403 HTML page)");
      }

      const formattedData = this.formatETFData(etfData);
      console.log(`Scraped ${formattedData.length} ETFs`);
      return formattedData;

    } catch (error: any) {
      console.error('Error scraping ETF:', error.message);
      return [];
    }
  }

  private formatETFData(etfData: any[]): any[] {
    return etfData.map((etf: any) => {
      const nameStr = (etf.meta?.companyName || etf.assets || etf.symbol).toLowerCase();
      let subCat = 'OTHER';

      if (nameStr.includes('gold') || nameStr.includes('silver') || nameStr.includes('commodity')) {
        subCat = 'COMMODITY';
      } else if (nameStr.includes('bond') || nameStr.includes('liquid') || nameStr.includes('gilt')) {
        subCat = 'BOND';
      } else if (nameStr.includes('bank') || nameStr.includes('tech') || nameStr.includes('infra') || nameStr.includes('pharma') || nameStr.includes('auto') || nameStr.includes('fmcg') || nameStr.includes('health') || nameStr.includes('it')) {
        subCat = 'SECTOR';
      }

      return {
        symbol: etf.symbol,
        name: etf.meta?.companyName || etf.assets || etf.symbol,
        category: 'ETF',
        subCategory: subCat,
        price: parseFloat(etf.ltP || etf.lastPrice) || 0,
        open: parseFloat(etf.open) || 0,
        high: parseFloat(etf.high) || 0,
        low: parseFloat(etf.low) || 0,
        previousClose: parseFloat(etf.prevClose) || 0,
        change: parseFloat(etf.chn) || 0,
        changePercent: parseFloat(etf.per) || 0,
        volume: parseInt(etf.qty) || 0,
        marketCap: parseFloat(etf.trdVal) || 0,
        timestamp: new Date(),
        lastUpdated: new Date()
      };
    });
  }

  // ... (Keep existing scrapeFromInvesting and saveStockData methods) ...
  // Ensure you include the rest of your class methods here

  // Save scraped data to database
  // ... inside StockScraperService class

  // Save scraped data to database (upsert: one doc per symbol+category)
  async saveStockData(stocksData: any[]): Promise<void> {
    try {
      if (stocksData.length === 0) {
        console.log('No stock data to save');
        return;
      }

      // 1. UPSERT to StockData (live price cache — always latest)
      const ops = stocksData.map(s => ({
        updateOne: {
          filter: { symbol: s.symbol, category: s.category },
          update: { $set: s },
          upsert: true
        }
      }));
      await StockData.bulkWrite(ops, { ordered: false });

      // 2. APPEND intraday snapshot to StockHistory (one per minute per symbol)
      // During market hours, every minute's data is stored so the 1D chart shows
      // full minute-by-minute OHLV. After market close, EOD compaction keeps only
      // the last price per symbol in DailySnapshot and deletes all intraday records.
      // A periodic safety-net cleanup runs every 30 min to catch missed EOD compactions.
      const todayIST = getISTMidnightUTC();

      const intradayDocs = stocksData.map(s => ({
        symbol: s.symbol,
        name: s.name,
        category: s.category,
        type: 'intraday',
        price: s.price,
        open: s.open,
        high: s.high,
        low: s.low,
        previousClose: s.previousClose,
        change: s.change,
        changePercent: s.changePercent,
        volume: s.volume,
        marketCap: s.marketCap,
        date: todayIST,
        timestamp: new Date()
      }));
      await StockHistory.insertMany(intradayDocs, { ordered: false });

      // 3. UPSERT DailySnapshot (live, in-progress) for 1W/1M/1Y views.
      //    Uses $setOnInsert for isClosed so we never overwrite a sealed record.
      const snapshotOps = stocksData.map(s => ({
        updateOne: {
          filter: { symbol: s.symbol, date: todayIST, isClosed: false },
          update: {
            $set: {
              name: s.name,
              category: s.category,
              price: s.price,
              open: s.open,
              high: s.high,
              low: s.low,
              previousClose: s.previousClose,
              change: s.change,
              changePercent: s.changePercent,
              volume: s.volume,
              marketCap: s.marketCap
            },
            $setOnInsert: {
              isClosed: false,
              closedAt: null
            }
          },
          upsert: true
        }
      }));
      await DailySnapshot.bulkWrite(snapshotOps, { ordered: false });

      console.log(`Stock data saved: ${stocksData.length} records upserted + intraday + daily snapshots.`);

    } catch (error: any) {
      console.error('Error saving stock data:', error.message);
    }
  }


  // ─── Pre-scrape cleanup ───────────────────────────────────────────────────
  // Called once at the top of every scrape cycle. On the first scrape of a new
  // trading day it detects past-day intraday records and:
  //   1. Compacts the last price per symbol into a sealed DailySnapshot
  //   2. Deletes all past-day intraday records from StockHistory
  // All subsequent scrapes on the same day exit instantly (nothing to clean).
  private async compactPastIntradayIfNeeded(): Promise<void> {
    try {
      const todayIST = getISTMidnightUTC();

      // Fast indexed check — exits in <5ms on 99% of calls (no past data)
      const hasPastData = await StockHistory.exists({
        type: 'intraday',
        date: { $lt: todayIST }
      });
      if (!hasPastData) return;

      console.log('📦 Scraper: New trading day detected — compacting past intraday data before writing...');

      // Find all distinct past dates that still have intraday records
      const pastDates: Date[] = await StockHistory.distinct('date', {
        type: 'intraday',
        date: { $lt: todayIST }
      });

      let totalSealed = 0;
      for (const dateVal of pastDates) {
        // Get the LAST intraday record per symbol for this date (the closing price)
        const lastPrices = await StockHistory.aggregate([
          { $match: { type: 'intraday', date: dateVal } },
          { $sort: { timestamp: -1 } },
          { $group: { _id: '$symbol', doc: { $first: '$$ROOT' } } },
          { $replaceRoot: { newRoot: '$doc' } }
        ]);

        if (lastPrices.length === 0) continue;

        // Upsert into DailySnapshot — only if not already sealed ($setOnInsert is idempotent)
        const snapshotOps = lastPrices.map((doc: any) => ({
          updateOne: {
            filter: { symbol: doc.symbol, date: dateVal },
            update: {
              $setOnInsert: {
                name: doc.name,
                category: doc.category,
                price: doc.price,
                open: doc.open,
                high: doc.high,
                low: doc.low,
                previousClose: doc.previousClose,
                change: doc.change,
                changePercent: doc.changePercent,
                volume: doc.volume,
                marketCap: doc.marketCap,
                isClosed: true,
                closedAt: doc.timestamp
              }
            },
            upsert: true
          }
        }));
        const result = await DailySnapshot.bulkWrite(snapshotOps, { ordered: false });
        totalSealed += (result.upsertedCount || 0);
      }

      // Delete ALL past intraday records — today's data is never touched
      const deleted = await StockHistory.deleteMany({
        type: 'intraday',
        date: { $lt: todayIST }
      });

      console.log(`📦 Scraper cleanup: Sealed ${totalSealed} DailySnapshot records, deleted ${deleted.deletedCount} past intraday records.`);
    } catch (error: any) {
      // Non-fatal: log and continue — the scrape must not be blocked by cleanup errors
      console.error('📦 Scraper pre-cleanup error (non-fatal):', error.message);
    }
  }

  // Main scraping function
  async scrapeAllStocks(): Promise<any[]> {
    try {
      console.log(`[${new Date().toISOString()}] Starting stock data scraping...`);

      // ── Step 0: Clean up any past-day intraday data before writing new records
      // This is the primary cleanup mechanism — data-driven, not time-driven.
      // On the first scrape of a new day it compacts Friday→DailySnapshot and deletes
      // Friday's intraday. All other scrapes exit this in <5ms.
      await this.compactPastIntradayIfNeeded();

      // Initialize session ONCE
      await this.initSession();

      // Scrape all indices. Each batch is upserted (one doc per symbol+category).
      const etfData = await this.scrapeETF();
      if (etfData.length > 0) await this.saveStockData(etfData);

      const nifty500Data = await this.scrapeNifty500();
      if (nifty500Data.length > 0) await this.saveStockData(nifty500Data);

      const nifty100Data = await this.scrapeNifty100();
      if (nifty100Data.length > 0) await this.saveStockData(nifty100Data);

      const nifty50Data = await this.scrapeNifty50();
      if (nifty50Data.length > 0) await this.saveStockData(nifty50Data);

      const allData = [...etfData, ...nifty500Data, ...nifty100Data, ...nifty50Data];

      console.log(`[${new Date().toISOString()}] Scraping completed successfully`);
      console.log(`Summary: ${nifty50Data.length} Nifty50, ${nifty100Data.length} Nifty100, ${nifty500Data.length} Nifty500, ${etfData.length} ETF stocks`);

      return allData;

    } catch (error: any) {
      console.error('Error in scrapeAllStocks:', error.message);
      return [];
    }
  }

  // ─── On-Demand Intraday Chart ───────────────────────────────────────
  // Fetches the FULL current trading day's minute-by-minute price data
  // from Yahoo Finance (primary) and NSE chart API (fallback).
  //
  // This data covers 9:15 AM → 3:30 PM IST regardless of our server uptime.
  // Used by the 1D history endpoint to fill gaps from server downtime.
  async fetchIntradayChart(symbol: string): Promise<{ timestamp: Date; price: number }[]> {
    // ── Strategy 1: Yahoo Finance (most reliable, no auth needed) ────
    try {
      const yahooSymbol = `${symbol}.NS`; // NSE suffix for Yahoo
      const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 10000
        }
      );

      const result = response.data?.chart?.result?.[0];
      const timestamps: number[] = result?.timestamp || [];
      const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];

      if (timestamps.length > 0) {
        const points = timestamps
          .map((ts: number, i: number) => ({
            timestamp: new Date(ts * 1000),
            price: closes[i]
          }))
          .filter((p: any) => p.price !== null && p.price !== undefined);

        if (points.length > 0) {
          console.log(`📊 Yahoo Finance: ${points.length} intraday points for ${symbol}`);
          return points as { timestamp: Date; price: number }[];
        }
      }
    } catch (error: any) {
      console.log(`📊 Yahoo Finance unavailable for ${symbol}: ${error.response?.status || error.code || 'error'}`);
    }

    // ── Strategy 2: NSE Chart API (fallback, may be rate-limited) ────
    if (!this.cookies) {
      return [];
    }

    const parseChartData = (data: any): { timestamp: Date; price: number }[] => {
      const chartData = data?.grapthData || data?.graphData || [];
      if (!Array.isArray(chartData) || chartData.length === 0) return [];
      return chartData.map(([ts, price]: [number, number]) => ({
        timestamp: new Date(ts),
        price: typeof price === 'number' ? price : parseFloat(price) || 0
      }));
    };

    try {
      const encodedSymbol = encodeURIComponent(`${symbol} EQN`);
      const response = await axios.get(
        `${this.nseBaseUrl}/chart-databyindex?index=${encodedSymbol}`,
        { headers: this.getAuthHeaders(), timeout: 10000 }
      );
      const points = parseChartData(response.data);
      if (points.length > 0) {
        console.log(`📊 NSE Chart: ${points.length} intraday points for ${symbol}`);
        return points;
      }
    } catch {
      // NSE also failed — return empty
    }

    console.log(`📊 No intraday chart data available for ${symbol} — using local data only`);
    return [];
  }
}

export default new StockScraperService();