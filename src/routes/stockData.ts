import express from 'express';
import {
  getStockData,
  getLatestStockData,
  getStockBySymbol,
  getStockHistory,
  manualScrape,
  getScraperStatus,
  clearStockData,
  searchStocks,
  manualCleanup
} from '../controllers/stockData';


const router = express.Router();

// ✅ SPECIFIC ROUTES FIRST (MUST come before :symbol dynamic route)
// These match your frontend API_ENDPOINTS.STOCK.NIFTY50 and API_ENDPOINTS.STOCK.ETF
router.get('/stocks/nifty50', async (req, res) => {
  req.query.category = 'NIFTY50';
  return getLatestStockData(req, res);
});

router.get('/stocks/nifty100', async (req, res) => {
  req.query.category = 'NIFTY100';
  return getLatestStockData(req, res);
});

router.get('/stocks/nifty500', async (req, res) => {
  req.query.category = 'NIFTY500';
  return getLatestStockData(req, res);
});

router.get('/stocks/etf', async (req, res) => {
  req.query.category = 'ETF';
  return getLatestStockData(req, res);
});

// General routes
router.get('/stocks/latest', getLatestStockData);
router.get('/stocks', getStockData);

// ✨ NEW: Live search for autocomplete
router.get('/stocks/search', searchStocks);

import { authorize } from '../common/guards/role.guard';

// Admin routes
router.post('/stocks/scrape', authorize(['super_admin', 'employee'], ['trading.scrape']), manualScrape);
router.get('/scraper/status', authorize(['super_admin', 'employee'], ['trading.scrape']), getScraperStatus);
router.delete('/stocks/clear', authorize(['super_admin', 'employee'], ['trading.delete']), clearStockData);
router.post('/stocks/cleanup', authorize(['super_admin', 'employee'], ['trading.scrape']), manualCleanup);


// ⚠️ CRITICAL: Dynamic :symbol route MUST BE LAST
router.get('/stocks/:symbol/history', getStockHistory);
router.get('/stocks/:symbol', getStockBySymbol);

export default router;
