import axios from 'axios';
import * as cheerio from 'cheerio';
import NewsData from '../models/newsData';
// Add this at the top of newsScraper.ts
import * as xml2js from 'xml2js';
class NewsScraperService {
  private nseBaseUrl = 'https://www.nseindia.com';
  private cookies = '';
  
  private headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://www.nseindia.com'
  };

  // Initialize NSE session (reuse from stock scraper)
  async initSession() {
    try {
      const response = await axios.get(this.nseBaseUrl, {
        headers: this.headers
      });
      
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        this.cookies = setCookie.join('; ');
        console.log('✅ NSE News Session Initialized');
      }
    } catch (error) {
      console.error('Failed to initialize NSE news session:', error);
    }
  }

  private getAuthHeaders() {
    return {
      ...this.headers,
      'Cookie': this.cookies
    };
  }

  // Scrape NSE India News
// Replace your scrapeNSENews() method with this
async scrapeNSENews(): Promise<any[]> {
  try {
    // Scrape from NSE's announcements/circulars page
    const url = 'https://www.nseindia.com/companies-listing/corporate-filings-announcements';
    
    const response = await axios.get(url, { 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const newsArticles: any[] = [];

    // NSE uses table structure for announcements
    $('table tbody tr').each((index, element) => {
      if (index >= 15) return false; // Limit to 15 articles

      const symbol = $(element).find('td').eq(0).text().trim();
      const company = $(element).find('td').eq(1).text().trim();
      const subject = $(element).find('td').eq(2).text().trim();
      const date = $(element).find('td').eq(3).text().trim();

      if (subject && company) {
        const title = `${company}: ${subject}`;
        newsArticles.push({
          title,
          description: subject,
          content: subject,
          url: `https://www.nseindia.com/companies-listing/corporate-filings-announcements#${encodeURIComponent(subject.slice(0, 80))}-${index}`,
          source: 'NSE',
          category: this.categorizeNews(subject),
          imageUrl: '',
          publishedAt: date ? this.parseNSEDate(date) : new Date(),
          relatedSymbols: symbol ? [symbol] : this.extractStockSymbols(title),
          timestamp: new Date()
        });
      }
    });

    console.log(`✅ Scraped ${newsArticles.length} NSE announcements`);
    return newsArticles;
    
  } catch (error: any) {
    console.error('Error scraping NSE news:', error.message);
    return [];
  }
}

// Add helper method to parse NSE date format
private parseNSEDate(dateStr: string): Date {
  try {
    // NSE date format: "05-Feb-2026" or similar
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date() : date;
  } catch {
    return new Date();
  }
}


  private formatNSENews(data: any[]): any[] {
    return data.map((news: any) => ({
      title: news.headline || news.title || 'No Title',
      description: news.description || news.summary || '',
      content: news.content || '',
      url: news.link || news.url || `${this.nseBaseUrl}/news/${Date.now()}`,
      source: 'NSE',
      category: this.categorizeNews(news.headline || news.title),
      imageUrl: news.image || '',
      publishedAt: news.publishedDate ? new Date(news.publishedDate) : new Date(),
      relatedSymbols: this.extractStockSymbols(news.headline || news.title),
      timestamp: new Date()
    }));
  }

  // Scrape Moneycontrol News
  async scrapeMoneycontrolNews(): Promise<any[]> {
    try {
      const url = 'https://www.moneycontrol.com/news/news-all/';
      const response = await axios.get(url, { headers: this.headers });
      
      const $ = cheerio.load(response.data);
      const newsArticles: any[] = [];

      // Moneycontrol uses li.clearfix for news items
      $('li.clearfix').each((index, element) => {
        if (index >= 20) return false; // Limit to 20 articles

        const title = $(element).find('h2 a').text().trim();
        const url = $(element).find('h2 a').attr('href') || '';
        const description = $(element).find('p').text().trim();
        const imageUrl = $(element).find('img').attr('data-src') || $(element).find('img').attr('src') || '';
        const timeText = $(element).find('span.ago').text().trim();

        if (title && url) {
          newsArticles.push({
            title,
            description,
            content: description,
            url,
            source: 'MONEYCONTROL',
            category: this.categorizeNews(title),
            imageUrl,
            publishedAt: this.parseRelativeTime(timeText),
            relatedSymbols: this.extractStockSymbols(title),
            timestamp: new Date()
          });
        }
      });

      console.log(`Scraped ${newsArticles.length} Moneycontrol news articles`);
      return newsArticles;
      
    } catch (error: any) {
      console.error('Error scraping Moneycontrol news:', error.message);
      return [];
    }
  }

  // Scrape Economic Times News
  async scrapeEconomicTimesNews(): Promise<any[]> {
    try {
      const url = 'https://economictimes.indiatimes.com/markets/stocks/news';
      const response = await axios.get(url, { headers: this.headers });
      
      const $ = cheerio.load(response.data);
      const newsArticles: any[] = [];

      // Economic Times structure
      $('.eachStory').each((index, element) => {
        if (index >= 15) return false; // Limit to 15 articles

        const title = $(element).find('h3 a').text().trim() || $(element).find('.story_text a').text().trim();
        const url = 'https://economictimes.indiatimes.com' + $(element).find('h3 a').attr('href') || $(element).find('.story_text a').attr('href') || '';
        const description = $(element).find('p').text().trim();
        const imageUrl = $(element).find('img').attr('data-original') || '';
        const timeText = $(element).find('time').text().trim();

        if (title && url) {
          newsArticles.push({
            title,
            description,
            content: description,
            url,
            source: 'ECONOMIC_TIMES',
            category: this.categorizeNews(title),
            imageUrl,
            publishedAt: this.parseRelativeTime(timeText),
            relatedSymbols: this.extractStockSymbols(title),
            timestamp: new Date()
          });
        }
      });

      console.log(`Scraped ${newsArticles.length} Economic Times news articles`);
      return newsArticles;
      
    } catch (error: any) {
      console.error('Error scraping Economic Times news:', error.message);
      return [];
    }
  }

  // Helper: Categorize news based on keywords
  private categorizeNews(title: string): string {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('ipo') || lowerTitle.includes('listing')) return 'IPO';
    if (lowerTitle.includes('nifty') || lowerTitle.includes('sensex') || lowerTitle.includes('market')) return 'MARKET';
    if (lowerTitle.includes('stock') || lowerTitle.includes('share')) return 'STOCKS';
    if (lowerTitle.includes('economy') || lowerTitle.includes('gdp') || lowerTitle.includes('inflation')) return 'ECONOMY';
    if (lowerTitle.includes('commodity') || lowerTitle.includes('gold') || lowerTitle.includes('crude')) return 'COMMODITIES';
    if (lowerTitle.includes('forex') || lowerTitle.includes('rupee') || lowerTitle.includes('dollar')) return 'FOREX';
    if (lowerTitle.includes('mutual fund') || lowerTitle.includes('mf')) return 'MUTUAL_FUNDS';
    
    return 'GENERAL';
  }

  // Helper: Extract stock symbols from text (basic implementation)
  private extractStockSymbols(text: string): string[] {
    const symbols: string[] = [];
    const commonStocks = ['TCS', 'INFY', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'ITC', 'SBIN', 'BHARTIARTL', 'WIPRO', 'HDFC'];
    
    commonStocks.forEach(symbol => {
      if (text.toUpperCase().includes(symbol)) {
        symbols.push(symbol);
      }
    });
    
    return symbols;
  }

  // Helper: Parse relative time like "2 hours ago"
  private parseRelativeTime(timeText: string): Date {
    const now = new Date();
    
    if (timeText.includes('minute') || timeText.includes('min')) {
      const minutes = parseInt(timeText) || 0;
      return new Date(now.getTime() - minutes * 60 * 1000);
    }
    
    if (timeText.includes('hour')) {
      const hours = parseInt(timeText) || 0;
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }
    
    if (timeText.includes('day')) {
      const days = parseInt(timeText) || 0;
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    
    return now;
  }

  // Save news to database (avoid duplicates)
  async saveNewsData(newsData: any[]): Promise<void> {
    try {
      if (newsData.length === 0) {
        console.log('No news data to save');
        return;
      }

      // Use bulkWrite with upsert to avoid duplicates based on URL
      const operations = newsData.map(news => ({
        updateOne: {
          filter: { url: news.url },
          update: { $set: news },
          upsert: true
        }
      }));

      const result = await NewsData.bulkWrite(operations);
      console.log(`News data saved: ${result.upsertedCount} new, ${result.modifiedCount} updated`);
      
    } catch (error: any) {
      console.error('Error saving news data:', error.message);
    }
  }

  // Main scraping function
  async scrapeAllNews(): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] Starting news scraping...`);
      
    //   await this.initSession();

      // Scrape all sources in parallel
      const [nseNews, moneycontrolNews, etNews] = await Promise.all([
        this.scrapeNSENews(),
        this.scrapeMoneycontrolNews(),
        this.scrapeEconomicTimesNews()
      ]);

      const allNews = [...nseNews, ...moneycontrolNews, ...etNews];
      await this.saveNewsData(allNews);

      console.log(`[${new Date().toISOString()}] News scraping completed`);
      console.log(`Summary: ${nseNews.length} NSE, ${moneycontrolNews.length} Moneycontrol, ${etNews.length} ET news articles`);
      
    } catch (error: any) {
      console.error('Error in scrapeAllNews:', error.message);
    }
  }
}

export default new NewsScraperService();
