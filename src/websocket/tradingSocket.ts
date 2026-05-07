import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import StockData from '../models/stockData';
import PortfolioHolding from '../models/portfolio';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

interface AuthenticatedSocket {
  userId?: string;
  role?: string;
}

export class TradingSocketServer {
  private io: SocketIOServer;
  private portfolioUpdateInterval: NodeJS.Timeout | null = null;
  private connectedClients = 0;

  // Portfolio update interval in ms (matches scraper cadence)
  private readonly PORTFOLIO_INTERVAL_MS = 60_000;

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: ENV.FRONTEND_URL.split(',').map(u => u.trim()),
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    // NOTE: No price update interval — prices are pushed from the scraper.
    // Portfolio interval is started on first client connection.
  }

  // ─── Authentication Middleware ──────────────────────────────────────
  private setupMiddleware() {
    this.io.use((socket: any, next) => {
      try {
        // Get token from handshake (client sends it during connection)
        let token = socket.handshake.auth.token || socket.handshake.query.token;

        // If no token in auth, check HttpOnly cookies
        if (!token && socket.handshake.headers.cookie) {
          const cookies = socket.handshake.headers.cookie.split(';').reduce((acc: any, cookieString: string) => {
            const [key, value] = cookieString.trim().split('=');
            acc[key] = value;
            return acc;
          }, {});
          token = cookies.accessToken;
        }

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
        socket.userId = decoded.userId;
        socket.role = decoded.role;

        console.log(`✅ WebSocket authenticated: User ${socket.userId}`);
        next();
      } catch (error) {
        console.error('WebSocket auth error:', error);
        next(new Error('Invalid authentication token'));
      }
    });
  }

  // ─── Event Handlers ────────────────────────────────────────────────
  private setupEventHandlers() {
    this.io.on('connection', (socket: any) => {
      this.connectedClients++;
      console.log(`🔌 User connected: ${socket.id} (UserID: ${socket.userId}) [${this.connectedClients} clients]`);

      // Join user's personal room for portfolio updates
      socket.join(`user:${socket.userId}`);

      // Start portfolio interval on first connection
      if (this.connectedClients === 1) {
        this.startPortfolioUpdates();
      }

      // Handle stock subscription
      socket.on('subscribe:stock', (symbol: string) => {
        if (!symbol) return;
        socket.join(`stock:${symbol.toUpperCase()}`);
        console.log(`📈 User ${socket.userId} subscribed to ${symbol}`);
        
        // Send immediate price update for subscribed stock
        this.sendImmediateStockUpdate(symbol.toUpperCase(), socket);
      });

      // Handle stock unsubscription
      socket.on('unsubscribe:stock', (symbol: string) => {
        if (!symbol) return;
        socket.leave(`stock:${symbol.toUpperCase()}`);
        console.log(`📉 User ${socket.userId} unsubscribed from ${symbol}`);
      });

      // Handle portfolio subscription
      socket.on('subscribe:portfolio', () => {
        console.log(`💼 User ${socket.userId} subscribed to portfolio updates`);
        this.sendImmediatePortfolioUpdate(socket.userId, socket);
      });

      // Handle multiple stock subscriptions at once
      socket.on('subscribe:stocks', (symbols: string[]) => {
        if (!Array.isArray(symbols)) return;
        symbols.forEach(symbol => {
          socket.join(`stock:${symbol.toUpperCase()}`);
        });
        console.log(`📊 User ${socket.userId} subscribed to ${symbols.length} stocks`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.connectedClients--;
        console.log(`🔴 User disconnected: ${socket.id} [${this.connectedClients} clients]`);

        // Stop portfolio interval when no clients connected
        if (this.connectedClients === 0) {
          this.stopPortfolioUpdates();
        }
      });

      // Handle ping for connection health check
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });
  }

  // ─── Push from Scraper (replaces the old 5s polling interval) ──────
  // Called by cronService after the scraper saves fresh data.
  // No DB queries needed — data comes directly from the scraper.
  public broadcastStockPrices(stocksData: any[]) {
    if (this.connectedClients === 0) return;

    const rooms = this.io.sockets.adapter.rooms;
    let broadcastCount = 0;

    stocksData.forEach(stock => {
      const roomName = `stock:${stock.symbol}`;
      if (rooms.has(roomName)) {
        this.io.to(roomName).emit('price:update', {
          symbol: stock.symbol,
          price: stock.price,
          open: stock.open,
          high: stock.high,
          low: stock.low,
          change: stock.change,
          changePercent: stock.changePercent,
          volume: stock.volume,
          timestamp: stock.timestamp || new Date()
        });
        broadcastCount++;
      }
    });

    if (broadcastCount > 0) {
      console.log(`📡 Pushed ${broadcastCount} stock prices to subscribed rooms`);
    }
  }

  // ─── Immediate Updates (on subscription) ───────────────────────────
  private async sendImmediateStockUpdate(symbol: string, socket: any) {
    try {
      // With upsert, there's only 1 doc per symbol — no sort needed
      const latestStock = await StockData.findOne({ symbol }).lean();

      if (latestStock) {
        socket.emit('price:update', {
          symbol: latestStock.symbol,
          price: latestStock.price,
          open: latestStock.open,
          high: latestStock.high,
          low: latestStock.low,
          change: latestStock.change,
          changePercent: latestStock.changePercent,
          volume: latestStock.volume,
          timestamp: latestStock.timestamp
        });
      }
    } catch (error) {
      console.error('Error sending immediate stock update:', error);
    }
  }

  private async sendImmediatePortfolioUpdate(userId: string, socket: any) {
    try {
      const holdings = await PortfolioHolding.find({ userId }).lean();
      
      if (holdings.length > 0) {
        // Batch: get all prices in ONE query
        const symbols = holdings.map(h => h.symbol);
        const prices = await StockData.find({ symbol: { $in: symbols } }).lean();
        const priceMap = new Map(prices.map(p => [p.symbol, p.price]));

        const updatedHoldings = holdings.map(holding => {
          const currentPrice = priceMap.get(holding.symbol) || holding.currentPrice;
          const currentValue = currentPrice * holding.quantity;
          const unrealizedPL = (currentPrice - holding.averageBuyPrice) * holding.quantity;
          const unrealizedPLPercent = ((currentPrice - holding.averageBuyPrice) / holding.averageBuyPrice) * 100;

          return {
            symbol: holding.symbol,
            stockName: holding.stockName,
            quantity: holding.quantity,
            averageBuyPrice: holding.averageBuyPrice,
            currentPrice,
            currentValue,
            unrealizedPL,
            unrealizedPLPercent
          };
        });

        const validHoldings = updatedHoldings.filter(h => h !== null);
        const totalValue = validHoldings.reduce((sum, h) => sum + (h?.currentValue || 0), 0);
        const totalPL = validHoldings.reduce((sum, h) => sum + (h?.unrealizedPL || 0), 0);

        socket.emit('portfolio:update', {
          holdings: validHoldings,
          totalValue,
          totalPL,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error sending immediate portfolio update:', error);
    }
  }

  // ─── Portfolio Updates (batched, smart start/stop) ─────────────────
  private startPortfolioUpdates() {
    if (this.portfolioUpdateInterval) return; // Already running

    console.log('💼 Portfolio update interval started (connected clients detected)');

    this.portfolioUpdateInterval = setInterval(async () => {
      try {
        // Collect all user IDs from connected rooms
        const rooms = this.io.sockets.adapter.rooms;
        const userIds = new Set<string>();

        rooms.forEach((_, roomName) => {
          if (roomName.startsWith('user:')) {
            userIds.add(roomName.replace('user:', ''));
          }
        });

        if (userIds.size === 0) return;

        // Batch: collect ALL holdings for ALL users, then get ALL prices in ONE query
        const allHoldings = await PortfolioHolding.find({
          userId: { $in: Array.from(userIds) }
        }).lean();

        if (allHoldings.length === 0) return;

        // Get ALL unique symbols across all users
        const allSymbols = [...new Set(allHoldings.map(h => h.symbol))];

        // ONE query for all prices (no aggregation needed with upsert pattern)
        const allPrices = await StockData.find({ symbol: { $in: allSymbols } }).lean();
        const priceMap = new Map(allPrices.map(p => [p.symbol, p.price]));

        // Group holdings by user and emit
        const holdingsByUser = new Map<string, typeof allHoldings>();
        for (const holding of allHoldings) {
          const uid = holding.userId.toString();
          if (!holdingsByUser.has(uid)) holdingsByUser.set(uid, []);
          holdingsByUser.get(uid)!.push(holding);
        }

        for (const [userId, holdings] of holdingsByUser) {
          const updatedHoldings = holdings.map(holding => {
            const currentPrice = priceMap.get(holding.symbol) || holding.currentPrice;
            const currentValue = currentPrice * holding.quantity;
            const unrealizedPL = (currentPrice - holding.averageBuyPrice) * holding.quantity;
            const unrealizedPLPercent = ((currentPrice - holding.averageBuyPrice) / holding.averageBuyPrice) * 100;

            return {
              symbol: holding.symbol,
              stockName: holding.stockName,
              quantity: holding.quantity,
              averageBuyPrice: holding.averageBuyPrice,
              currentPrice,
              currentValue,
              unrealizedPL,
              unrealizedPLPercent
            };
          });

          const totalValue = updatedHoldings.reduce((sum, h) => sum + h.currentValue, 0);
          const totalPL = updatedHoldings.reduce((sum, h) => sum + h.unrealizedPL, 0);

          this.io.to(`user:${userId}`).emit('portfolio:update', {
            holdings: updatedHoldings,
            totalValue,
            totalPL,
            timestamp: new Date()
          });
        }

        console.log(`💼 Updated portfolios for ${holdingsByUser.size} users (${allSymbols.length} symbols, 1 price query)`);

      } catch (error) {
        console.error('Error broadcasting portfolio updates:', error);
      }
    }, this.PORTFOLIO_INTERVAL_MS);
  }

  private stopPortfolioUpdates() {
    if (this.portfolioUpdateInterval) {
      clearInterval(this.portfolioUpdateInterval);
      this.portfolioUpdateInterval = null;
      console.log('💼 Portfolio update interval stopped (no clients connected)');
    }
  }

  // ─── Public Methods (for controllers) ──────────────────────────────
  // Emit trade notification to specific user
  public notifyTradeExecuted(userId: string, tradeData: any) {
    this.io.to(`user:${userId}`).emit('trade:executed', {
      ...tradeData,
      timestamp: new Date()
    });
    console.log(`✅ Trade notification sent to user ${userId}`);
  }

  // Emit AI alert to specific user
  public notifyAIAlert(userId: string, alert: any) {
    this.io.to(`user:${userId}`).emit('ai:alert', {
      ...alert,
      timestamp: new Date()
    });
    console.log(`🤖 AI alert sent to user ${userId}`);
  }

  // Broadcast market status update to all users
  public broadcastMarketStatus(status: string, message: string) {
    this.io.emit('market:status', {
      status,
      message,
      timestamp: new Date()
    });
    console.log(`📢 Market status broadcast: ${message}`);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────
  public shutdown() {
    this.stopPortfolioUpdates();
    this.io.close();
    console.log('🔴 WebSocket server shut down');
  }
}
