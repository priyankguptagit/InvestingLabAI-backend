import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import StockData from '../models/stockData';
import PortfolioHolding from '../models/portfolio';
import { PaperTradeModel } from '../models/paperTrade';
import { ENV } from '../config/env';
import aiChatbotService from './aiChatbot';

interface AIAnalysisResult {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidenceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string;
  keyFactors: string[];
  suggestedPrice?: number;
  stopLoss?: number;
  target?: number;
}

class AITradingService {
  private aiChatbotEndpoint: string;

  constructor() {
    this.aiChatbotEndpoint = process.env.AI_CHATBOT_URL || `${ENV.BACKEND_URL}/api/ai/chat/message`;
  }

  // ✅ 1. ADD THIS HELPER METHOD
  private async callAI(prompt: string, userId: string, context: string, token: string) {
    return await axios.post(this.aiChatbotEndpoint, {
      userId,
      message: prompt,
      context
    }, {
      headers: { 'Authorization': token }, // This fixes the 401 error
      timeout: 20000
    });
  }

  // ✅ 2. UPDATE SIGNATURE: Add 'token' parameter
  async getStockAnalysis(symbol: string, userId: string, token: string): Promise<AIAnalysisResult> {
    try {
      const stockHistory = await StockData.find({ symbol })
        .sort({ timestamp: -1 })
        .limit(30)
        .lean();

      if (stockHistory.length === 0) {
        throw new Error(`No data available for ${symbol}`);
      }

      const latestStock = stockHistory[0];

      const prices = stockHistory.map(s => s.price);
      const sma5 = this.calculateSMA(prices, 5);
      const sma10 = this.calculateSMA(prices, 10);
      const rsi = this.calculateRSI(prices, 14);
      const volatility = this.calculateVolatility(prices);

      const prompt = `
You are an expert stock analyst. Analyze the following stock and provide trading recommendation:

Stock: ${latestStock.name} (${symbol})
Current Price: ₹${latestStock.price}
Category: ${latestStock.category}

Recent Performance:
- Open: ₹${latestStock.open}
- High: ₹${latestStock.high}
- Low: ₹${latestStock.low}
- Previous Close: ₹${latestStock.previousClose}
- Change: ₹${latestStock.change} (${latestStock.changePercent}%)
- Volume: ${latestStock.volume ? latestStock.volume.toLocaleString() : "N/A"}

Technical Indicators:
- 5-day SMA: ₹${sma5.toFixed(2)}
- 10-day SMA: ₹${sma10.toFixed(2)}
- RSI (14): ${rsi.toFixed(2)}
- Volatility: ${(volatility * 100).toFixed(2)}%

Price Trend (Last 7 days): ${prices.slice(0, 7).map(p => '₹' + p.toFixed(2)).join(', ')}

Based on this data, provide:
1. Trading recommendation (BUY/SELL/HOLD)
2. Confidence score (0-100)
3. Risk level (LOW/MEDIUM/HIGH)
4. Detailed reasoning
5. Key factors influencing the decision
6. Suggested entry price
7. Stop loss level
8. Target price

Format your response as JSON.
`;

      // ✅ 3. REFACTOR: Use the helper method
      const aiResponse = await this.callAI(prompt, userId, 'stock_analysis', token);

      const aiText = aiResponse.data?.data?.message || aiResponse.data?.response || '';
      const aiAnalysis = this.parseAIResponse(aiText);

      return {
        recommendation: aiAnalysis.recommendation || 'HOLD',
        confidenceScore: aiAnalysis.confidenceScore || 50,
        riskLevel: aiAnalysis.riskLevel || 'MEDIUM',
        reasoning: aiAnalysis.reasoning || 'Analysis based on current market data',
        keyFactors: aiAnalysis.keyFactors || [],
        suggestedPrice: aiAnalysis.suggestedPrice || latestStock.price,
        stopLoss: aiAnalysis.stopLoss || latestStock.price * 0.95,
        target: aiAnalysis.target || latestStock.price * 1.10
      };

    } catch (error: any) {
      console.error('AI Analysis Error:', error.message);
      return this.getFallbackAnalysis(symbol);
    }
  }

  // ✅ 2. UPDATE SIGNATURE: Add 'token' parameter
  async getPortfolioAnalysis(userId: string, token: string): Promise<string> {
    try {
      const portfolio = await PortfolioHolding.find({ userId }).lean();

      if (portfolio.length === 0) {
        return "Your portfolio is empty. Start by making your first paper trade!";
      }

      const portfolioSummary = portfolio.map(h => ({
        stock: `${h.stockName} (${h.symbol})`,
        quantity: h.quantity,
        invested: h.totalInvested,
        current: h.currentValue,
        pl: h.unrealizedPL,
        plPercent: h.unrealizedPLPercent.toFixed(2)
      }));
      return await aiChatbotService.generatePortfolioReport(portfolioSummary);

    } catch (error: any) {
      console.error('Portfolio Analysis Error:', error.message);
      return 'Unable to generate portfolio analysis at this time.';
    }
  }

  // ✅ 2. UPDATE SIGNATURE: Add 'token' parameter
  async getTradingInsights(userId: string, token: string): Promise<any> {
    try {
      const recentTrades = await PaperTradeModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const tradesSummary = {
        totalTrades: recentTrades.length,
        buyCount: recentTrades.filter(t => t.type === 'BUY').length,
        sellCount: recentTrades.filter(t => t.type === 'SELL').length,
        mostTradedSymbols: this.getMostTradedSymbols(recentTrades),
        averageTradeSize: this.getAverageTradeSize(recentTrades)
      };

      const prompt = `
Analyze this trader's behavior and provide personalized insights:

Trading Summary:
${JSON.stringify(tradesSummary, null, 2)}

Provide:
1. Trading pattern analysis
2. Strengths and weaknesses
3. Behavioral insights
4. Suggestions for improvement
5. Risk management tips

Keep response under 200 words.
`;

      // ✅ 3. REFACTOR: Use the helper method
      const aiResponse = await this.callAI(prompt, userId, 'trading_insights', token);

      return {
        insights: aiResponse.data?.data?.message || aiResponse.data?.response || 'Trading insights unavailable',
        tradingSummary: tradesSummary
      };

    } catch (error: any) {
      console.error('Trading Insights Error:', error.message);
      return {
        insights: 'Trading insights unavailable',
        tradingSummary: null
      };
    }
  }

  // ✅ NEWS-BASED AI RECOMMENDATION (calls Gemini directly)
  async getNewsBasedRecommendation(
    symbol: string,
    stockName: string,
    newsItems: Array<{ title: string; description: string; source: string; publishedAt: Date }>,
    userId: string,
    token: string
  ): Promise<{ action: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string }> {
    try {
      if (!newsItems || newsItems.length === 0) {
        return { action: 'HOLD', confidence: 40, reasoning: 'Insufficient news data to generate a recommendation.' };
      }

      const newsSummary = newsItems
        .slice(0, 8)
        .map((n, i) => `${i + 1}. [${n.source}] ${n.title}: ${n.description || ''}`)
        .join('\n');

      const prompt = `You are a professional Indian stock market analyst reviewing recent news for trading decisions.

Stock: ${stockName} (${symbol})

Recent relevant news:
${newsSummary}

Based solely on the above news, provide a trading recommendation. Be concise and actionable.

Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
{"action": "BUY", "confidence": 72, "reasoning": "Your 2-3 sentence explanation here."}`;

      // Use Gemini SDK directly (same pattern as aiChatbot.ts)
      const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY || '');
      const model = genAI.getGenerativeModel({ model: ENV.AI_MODEL || 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const rawText = result.response.text().trim();

      // Strip markdown code blocks if present
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          action: ['BUY', 'SELL', 'HOLD'].includes(parsed.action) ? parsed.action : 'HOLD',
          confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : 50,
          reasoning: parsed.reasoning || 'Based on current news analysis.'
        };
      }

      return { action: 'HOLD', confidence: 50, reasoning: 'Unable to parse AI recommendation from news.' };
    } catch (error: any) {
      console.error('News-based AI Recommendation Error:', error.message);
      return { action: 'HOLD', confidence: 40, reasoning: 'AI recommendation unavailable at this time.' };
    }
  }

  // --- Helper Methods ---

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[0] || 0;
    const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 0; i < period; i++) {
      const change = prices[i] - prices[i + 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 0; i < prices.length - 1; i++) {
      returns.push((prices[i] - prices[i + 1]) / prices[i + 1]);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  private parseAIResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {};
    } catch {
      return {};
    }
  }

  private getFallbackAnalysis(symbol: string): AIAnalysisResult {
    return {
      recommendation: 'HOLD',
      confidenceScore: 50,
      riskLevel: 'MEDIUM',
      reasoning: 'Technical analysis indicates neutral market conditions.',
      keyFactors: ['Market volatility', 'Volume analysis', 'Price trends'],
      suggestedPrice: undefined,
      stopLoss: undefined,
      target: undefined
    };
  }

  private getMostTradedSymbols(trades: any[]): string[] {
    const symbolCount: { [key: string]: number } = {};
    trades.forEach(t => {
      symbolCount[t.symbol] = (symbolCount[t.symbol] || 0) + 1;
    });
    return Object.entries(symbolCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([symbol]) => symbol);
  }

  private getAverageTradeSize(trades: any[]): number {
    if (trades.length === 0) return 0;
    const totalAmount = trades.reduce((sum, t) => sum + t.totalAmount, 0);
    return totalAmount / trades.length;
  }
}

export default new AITradingService();
