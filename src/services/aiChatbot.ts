import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import StockData from '../models/stockData';
import { ChatMessageModel } from '../models/chatMessage';
import { ENV } from '../config/env';

interface ChatOptions {
  maxHistory?: number;
  includeMarketContext?: boolean;
}

class AIChatbotService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = ENV.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in environment variables');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: ENV.AI_MODEL || 'gemini-1.5-flash',
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });
    console.log('✅ AI Chatbot Service initialized with Gemini');
  }

  /**
   * Get real-time market context for AI
   */
  private async getMarketContext(): Promise<string> {
    try {
      const [niftyStocks, etfs] = await Promise.all([
        StockData.find({ category: 'NIFTY50' })
          .sort({ changePercent: -1 })
          .limit(10)
          .select('symbol price changePercent')
          .lean(),
        StockData.find({ category: 'ETF' })
          .sort({ changePercent: -1 })
          .limit(5)
          .select('symbol price changePercent')
          .lean()
      ]);

      const niftyData = niftyStocks.map(s =>
        `${s.symbol}: ₹${s.price.toFixed(2)} (${s.changePercent != null && s.changePercent > 0 ? '+' : ''}${s.changePercent?.toFixed(2) ?? 'N/A'}%)`
      ).join(', ');

      const etfData = etfs.map(s =>
        `${s.symbol}: ₹${s.price.toFixed(2)} (${s.changePercent != null && s.changePercent > 0 ? '+' : ''}${s.changePercent?.toFixed(2) ?? 'N/A'}%)`
      ).join(', ');

      return `\nCurrent Market Data: Top Nifty 50: ${niftyData}. Top ETFs: ${etfData}`;
    } catch (error) {
      return '';
    }
  }

  /**
   * ✅ NEW: Educational framing system prompt
   */
  private getSystemPrompt(): string {
    return `You are a knowledgeable stock market education assistant for Praedico, an Indian stock trading learning platform.

Your role is to EDUCATE users comprehensively about:
- How Nifty 50, Sensex, and other indices work
- What different stocks represent, their business models, and sectors
- How to analyze stocks using fundamentals and technicals
- Market concepts, terminology, and investment principles
- Historical performance, trends, and market events
- Real-time market data and its implications

RESPONSE STYLE:
✅ BE DETAILED: Provide comprehensive answers with multiple points
✅ USE STRUCTURE: Break down complex topics into digestible sections
✅ BE SPECIFIC: Include examples, numbers, and real company names
✅ BE CONVERSATIONAL: Write naturally, like a knowledgeable friend
✅ ADD CONTEXT: Explain WHY things matter, not just WHAT they are

RESPONSE LENGTH:
- Simple questions: 3-4 sentences minimum
- Complex questions: 5-8 sentences with bullet points
- Company/stock queries: Include business model, sectors, and market position

❌ AVOID:
- Single-sentence answers (always elaborate!)
- Saying "I cannot provide financial advice" unless asked for specific buy/sell recommendations
- Being overly cautious - you're an EDUCATOR, not a compliance officer

EXAMPLES OF GOOD RESPONSES:

Q: "What is Nifty 50?"
A: "The Nifty 50 is India's premier stock market index, representing the weighted average of 50 of the largest and most liquid Indian companies listed on the National Stock Exchange (NSE). These 50 stocks are carefully selected across 13 key sectors including IT, Banking, FMCG, Pharma, and Energy, making it a true reflection of the Indian economy.

Together, these companies account for roughly 65% of the free-float market capitalization of all stocks listed on NSE. Major constituents include Reliance Industries (the most valuable), TCS, HDFC Bank, Infosys, ITC, and Bharti Airtel. The index is widely used by investors, fund managers, and economists to gauge market performance and serves as the underlying benchmark for many index funds, ETFs, and derivatives contracts. It was launched in 1996 with a base value of 1,000 points."

Q: "Tell me about Reliance Industries"
A: "Reliance Industries Limited (RIL) is India's most valuable company by market capitalization and a true conglomerate with three core business segments:

1. **Oil to Chemicals (O2C)**: The legacy business, operating the world's largest refining complex at Jamnagar, Gujarat. Produces petroleum products and petrochemicals.

2. **Jio Platforms**: Launched in 2016, Reliance Jio disrupted India's telecom sector by offering cheap 4G data and free voice calls, quickly becoming India's largest telecom operator with 450+ million subscribers. Now expanding into 5G and digital services.

3. **Reliance Retail**: India's largest and most profitable retail chain with 18,000+ stores across grocery, fashion, electronics, and e-commerce.

Founded by Dhirubhai Ambani in 1966, RIL is now led by his son Mukesh Ambani, India's richest person. The stock is a Nifty 50 heavyweight with approximately 10% weightage in the index, making it a market bellwether. It's known for consistent growth, aggressive expansion, and strong fundamentals."

Q: "Should I buy Reliance stock?"
A: "Reliance Industries is fundamentally one of India's strongest companies with diversified revenue streams across energy, telecom, retail, and now renewable energy. The company has shown consistent profitability, has minimal debt after recent fundraising, and is investing heavily in future growth areas like 5G, green energy, and e-commerce.

However, whether you should invest depends on several personal factors:
- **Investment Horizon**: Long-term investors (3-5+ years) typically find more value
- **Risk Tolerance**: Large-cap stocks like RIL are generally lower risk than mid/small caps
- **Portfolio Allocation**: Avoid putting too much in a single stock (diversification principle)
- **Current Valuation**: Check if the stock is trading at reasonable P/E ratios compared to historical averages

For personalized investment decisions aligned with your specific financial goals, age, income, and risk profile, I'd recommend consulting a SEBI-registered financial advisor. They can assess your complete financial situation and provide tailored advice."

Remember: Your goal is to EDUCATE thoroughly, not just answer briefly. Be helpful and informative!`;
  }


  /**
   * Get conversation history
   */
  private async getConversationHistory(
    userId: string,
    limit: number = 6
  ): Promise<Array<{ role: string; content: string }>> {
    try {
      const messages = await ChatMessageModel.find({
        userId,
        role: { $ne: 'system' }
      })
        .sort({ timestamp: -1 })
        .limit(limit)
        .select('role content')
        .lean();

      return messages.reverse().map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    } catch (error) {
      return [];
    }
  }

  private sanitizeGeminiHistory(history: Array<{ role: string; content: string }>) {
    const geminiHistory = history
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

    while (geminiHistory.length > 0 && geminiHistory[0].role === 'model') {
      geminiHistory.shift();
    }

    const normalized: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const entry of geminiHistory) {
      const lastEntry = normalized[normalized.length - 1];

      if (lastEntry && lastEntry.role === entry.role) {
        lastEntry.parts[0].text = `${lastEntry.parts[0].text}\n\n${entry.parts[0].text}`;
        continue;
      }

      normalized.push(entry as { role: 'user' | 'model'; parts: Array<{ text: string }> });
    }

    return normalized;
  }

  /**
   * Main chat function
   */
  async chat(
    userId: string,
    userMessage: string,
    options: ChatOptions = {}
  ): Promise<{ response: string; tokensUsed?: number; responseTime: number }> {
    const startTime = Date.now();

    try {
      const { maxHistory = 6, includeMarketContext = true } = options;

      const history = await this.getConversationHistory(userId, maxHistory);
      const marketContext = includeMarketContext ? await this.getMarketContext() : '';

      const geminiHistory = this.sanitizeGeminiHistory(history);

      const chat = this.model.startChat({
        history: geminiHistory,
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          topK: 64,
          maxOutputTokens: 2048,
        },
      });

      // ✅ NEW: Inject system prompt as first user message if new conversation
      let fullMessage = userMessage;
      if (history.length === 0) {
        fullMessage = `${this.getSystemPrompt()}${marketContext}\n\n---\n\nNow answer this student's question:\n${userMessage}`;
      }

      const result = await chat.sendMessage(fullMessage);
      const aiResponse = result.response.text();
      const responseTime = Date.now() - startTime;

      console.log(`✅ AI Response generated in ${responseTime}ms`);

      return {
        response: aiResponse,
        tokensUsed: undefined,
        responseTime
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      console.error('❌ AI Chatbot Error:', error);

      if (error.message?.includes('quota')) {
        throw new Error('AI service temporarily unavailable. Please try again in a minute.');
      }

      if (error.message?.includes('safety')) {
        throw new Error('Your message was flagged by content filters. Please rephrase.');
      }

      throw new Error('Failed to generate AI response. Please try again.');
    }
  }

  /**
   * Stock analysis
   */
  async analyzeStock(symbol: string): Promise<string> {
    try {
      const stock = await StockData.findOne({ symbol })
        .sort({ timestamp: -1 })
        .lean();

      if (!stock) {
        return `Stock ${symbol} not found in our database.`;
      }

      const changeDirection = (stock.changePercent ?? 0) >= 0 ? 'up' : 'down';
      const high = stock.high ?? stock.price ?? 0;
      const low = stock.low ?? stock.price ?? 0;
      const previousClose = stock.previousClose ?? stock.price ?? 0;
      const volatility = previousClose !== 0 ? (((high - low) / previousClose) * 100).toFixed(2) : '0.00';

      const analysisPrompt = `As a stock market educator, analyze ${stock.symbol} (${stock.name}) for students:

Current Price: ₹${stock.price}
Today's Change: ${changeDirection} ${Math.abs(stock.changePercent ?? 0)}%
Day Range: ₹${stock.low} - ₹${stock.high}
Volatility: ${volatility}%

Provide:
1. Brief company overview (2 sentences)
2. Today's performance context
3. Risk level estimate (Low/Medium/High)
4. Suitable for short-term or long-term investing

Keep educational, under 150 words.`;

      const result = await this.model.generateContent(analysisPrompt);
      return result.response.text();
    } catch (error: any) {
      throw new Error('Failed to analyze stock.');
    }
  }

  /**
   * Portfolio recommendation
   */
  async recommendPortfolio(
    budget: number,
    riskLevel: 'low' | 'medium' | 'high'
  ): Promise<string> {
    try {
      const niftyLimit = riskLevel === 'low' ? 5 : riskLevel === 'medium' ? 7 : 10;
      const etfLimit = riskLevel === 'low' ? 3 : 2;

      const [niftyStocks, etfs] = await Promise.all([
        StockData.find({ category: 'NIFTY50' })
          .sort({ changePercent: -1 })
          .limit(niftyLimit)
          .select('symbol name price')
          .lean(),
        StockData.find({ category: 'ETF' })
          .sort({ changePercent: -1 })
          .limit(etfLimit)
          .select('symbol price')
          .lean()
      ]);

      const niftyData = niftyStocks.map(s => `${s.symbol}: ₹${s.price.toFixed(2)}`).join(', ');
      const etfData = etfs.map(s => `${s.symbol}: ₹${s.price.toFixed(2)}`).join(', ');

      const portfolioPrompt = `As a stock market educator, create a SAMPLE diversified portfolio allocation for learning purposes:

Budget: ₹${budget.toLocaleString('en-IN')}
Risk Level: ${riskLevel}
Available Stocks: ${niftyData}
Available ETFs: ${etfData}

Provide:
1. Allocation percentages (stocks/ETFs/cash)
2. Sample stock picks with suggested quantities
3. Educational rationale for ${riskLevel} risk investors
4. Investment time horizon suggestion

Format clearly. Under 250 words. Remember: This is for LEARNING, not actual financial advice.`;

      const result = await this.model.generateContent(portfolioPrompt);
      return result.response.text();
    } catch (error: any) {
      throw new Error('Failed to generate portfolio recommendation.');
    }
  }

  /**
   * Generate a structured 7-section portfolio report for reconciliation.
   * Uses generateContent() directly — no chat history, no system prompt injection.
   */
  async generatePortfolioReport(portfolioSummary: object[]): Promise<string> {
    const prompt = `You are a portfolio analyst for an Indian paper trading learning platform.

Analyze the following portfolio holdings:
${JSON.stringify(portfolioSummary, null, 2)}

Respond with EXACTLY 7 sections numbered 1 through 7. Each section must start on a new line with the number and a period. Do NOT merge sections. Do NOT add commentary outside the sections.

1. Overall portfolio health assessment
Write 2-3 sentences assessing the overall health of the portfolio.

2. Diversification analysis
Write 2-3 sentences on how well diversified the portfolio is.

3. Risk assessment
Write 2-3 sentences on the risk level and exposure.

4. Recommendations for rebalancing
Write 2-3 sentences with specific rebalancing suggestions.

5. Which stocks to consider selling
Write 2-3 sentences identifying any weak or overexposed stocks to consider selling.

6. Which categories to invest more in
Write 2-3 sentences on sectors or categories that should get more allocation.

7. Overall strategy suggestions
Write 2-3 sentences with a high-level strategy for the student going forward.`;

    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}

export default new AIChatbotService();
