import { Request, Response } from 'express';
import NewsData from '../models/newsData';
import cronService from '../services/cronService';

export const getNews = async (req: Request, res: Response) => {
  try {
    const { source, category, limit = 50 } = req.query;
    const query: any = {};

    if (source) {
      query.source = source;
    }
    
    if (category) {
      query.category = category;
    }

    const news = await NewsData.find(query)
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit as string))
      .lean();

    res.status(200).json({
      success: true,
      count: news.length,
      data: news
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching news data',
      error: error.message
    });
  }
};

export const getLatestNews = async (req: Request, res: Response) => {
  try {
    const { source, category, limit = 20 } = req.query;
    const query: any = {};

    if (source) {
      query.source = source;
    }
    
    if (category) {
      query.category = category;
    }

    const news = await NewsData.find(query)
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit as string))
      .lean();

    res.status(200).json({
      success: true,
      count: news.length,
      data: news,
      lastUpdated: news[0]?.publishedAt || new Date()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching latest news',
      error: error.message
    });
  }
};

export const getNewsBySymbol = async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { limit = 10 } = req.query;

    const news = await NewsData.find({ relatedSymbols: (Array.isArray(symbol) ? symbol[0] : symbol).toUpperCase() })
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit as string))
      .lean();

    if (!news || news.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No news found for this symbol'
      });
    }

    res.status(200).json({
      success: true,
      count: news.length,
      data: news
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching news by symbol',
      error: error.message
    });
  }
};

export const manualNewsScrape = async (req: Request, res: Response) => {
  try {
    await cronService.runNewsScraperNow();
    res.status(200).json({
      success: true,
      message: 'Manual news scraping initiated'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error triggering manual news scrape',
      error: error.message
    });
  }
};

export const getNewsScraperStatus = async (req: Request, res: Response) => {
  try {
    const status = cronService.getJobStatus();
    const lastUpdate = await NewsData.findOne()
      .sort({ publishedAt: -1 })
      .select('publishedAt')
      .lean();

    res.status(200).json({
      success: true,
      status,
      lastUpdate: lastUpdate?.publishedAt || null
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error getting news scraper status',
      error: error.message
    });
  }
};
