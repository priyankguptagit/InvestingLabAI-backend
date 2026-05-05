import express from 'express';
import {
  getNews,
  getLatestNews,
  getNewsBySymbol,
  manualNewsScrape,
  getNewsScraperStatus
} from '../controllers/newsData';

const router = express.Router();

// ✅ SPECIFIC ROUTES FIRST
// Category-based routes
router.get('/news/market', async (req, res) => {
  req.query.category = 'MARKET';
  return getLatestNews(req, res);
});

router.get('/news/stocks', async (req, res) => {
  req.query.category = 'STOCKS';
  return getLatestNews(req, res);
});

router.get('/news/ipo', async (req, res) => {
  req.query.category = 'IPO';
  return getLatestNews(req, res);
});

// General routes
router.get('/news/latest', getLatestNews);
router.get('/news', getNews);

import { authorize } from '../common/guards/role.guard';

// Admin routes
router.post('/news/scrape', authorize(['super_admin', 'employee'], ['trading.scrape']), manualNewsScrape);
router.get('/news/scraper/status', authorize(['super_admin', 'employee'], ['trading.scrape']), getNewsScraperStatus);

// ⚠️ DYNAMIC ROUTES LAST
router.get('/news/symbol/:symbol', getNewsBySymbol);

export default router;
