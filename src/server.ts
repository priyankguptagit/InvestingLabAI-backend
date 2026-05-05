import { createApp } from "./app";
import connectDB from "./config/database";
import { ENV } from "./config/env";
import http from "http";
import mongoose from "mongoose";
import cronService from "./services/cronService";
import { TradingSocketServer } from "./websocket/tradingSocket";
import { isISTMarketOpen } from "./utils/dateUtils";

// ─── Serverless Detection ─────────────────────────────────────────────────────
// On Vercel, the function runs as a stateless serverless handler.
// We detect this so we can skip persistent features (cron jobs, WebSockets,
// server.listen()) that don't work in a Lambda/serverless environment.
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// ─── App Instance ─────────────────────────────────────────────────────────────
const app = createApp();

// ─── Lazy DB Connection (Serverless) ─────────────────────────────────────────
// In serverless mode, Vercel may reuse a warm container. We cache the connection
// promise so we only connect once per container lifecycle.
let dbConnectionPromise: Promise<void> | null = null;

const ensureDbConnected = (): Promise<void> => {
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectDB();
  }
  return dbConnectionPromise;
};

if (isServerless) {
  // ─── Serverless Mode ───────────────────────────────────────────────────────
  // Vercel calls the exported handler for each incoming request.
  // We wrap the Express app to guarantee the DB is connected before routing.
  // Cron jobs and WebSockets are NOT started — they are incompatible with serverless.
  console.log("🌐 Running in serverless mode (Vercel). Cron jobs and WebSockets are disabled.");

  // Export the Express app as the default Vercel handler.
  // @vercel/node calls this as a standard Node.js HTTP handler.
  module.exports = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    await ensureDbConnected();
    app(req, res);
  };

} else {
  // ─── Traditional Long-Running Server Mode ─────────────────────────────────
  const startServer = async () => {
    const server = http.createServer(app);

    // Connect to Database
    await connectDB();

    // Initialize WebSocket Server
    const tradingSocket = new TradingSocketServer(server);
    (global as any).tradingSocket = tradingSocket;
    console.log("🌐 WebSocket server initialized");

    // Run startup cleanup
    await cronService.runStartupCleanup();

    // Immediate scrape if market is open
    if (isISTMarketOpen()) {
      console.log("📈 Market is open — triggering immediate startup scrape...");
      cronService.runScraperNow().catch((err) =>
        console.error("📈 Startup scrape error:", err)
      );
    }

    // Start Cron Jobs
    cronService.startScraperJob();
    cronService.startNewsScraperJob();
    cronService.startSubscriptionExpiryJob();
    cronService.startTradingLevelJob();
    cronService.startCertificateJob();
    cronService.startEodCompactionJob();
    cronService.startPeriodicCleanupJob();
    console.log("📊 Stock scraper cron job started");
    console.log("📰 News scraper cron job started");

    // Start Listener
    server.listen(ENV.PORT, () => {
      console.log(`\n🚀 Ferrari Engine Started on Port: ${ENV.PORT}`);
      console.log(`🛡️ RBAC Security System: ACTIVE`);
      console.log(`🌐 WebSocket Real-Time System: ACTIVE`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}\n`);
    });

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Closing HTTP server...`);
      server.close(async () => {
        console.log("✅ HTTP server closed.");
        tradingSocket.shutdown();
        console.log("🔴 WebSocket server shut down");
        console.log("✅ WebSocket server closed.");
        cronService.stopScraperJob();
        cronService.stopNewsScraperJob();
        cronService.stopTradingLevelJob();
        cronService.stopEodCompactionJob();
        cronService.stopPeriodicCleanupJob();
        console.log("Stock scraper cron job stopped");
        console.log("News scraper cron job stopped");
        console.log("🏆 Trading Level cron job stopped");
        console.log("🌙 EOD Compaction cron job stopped");
        console.log("🧹 Periodic cleanup job stopped");
        console.log("✅ Cron jobs stopped.");
        await mongoose.connection.close(false);
        console.log("✅ MongoDB connection closed.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  };

  // Catch Unhandled Rejections
  process.on("unhandledRejection", (err: Error) => {
    console.error("❌ UNHANDLED REJECTION! Shutting down...");
    console.error(err.name, err.message);
    process.exit(1);
  });

  startServer();
}

// Also export the app for testing or other module imports
export default app;
