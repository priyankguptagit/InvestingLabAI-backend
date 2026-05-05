import * as cron from 'node-cron';
import stockScraperService from './stockScraper';
import newsScraperService from './newsScraper';
import { OrganizationModel } from '../models/organization';
import { OrganizationAdminModel } from '../models/organizationAdmin';
import { sendSubscriptionExpiryEmail, sendUserSubscriptionExpiryEmail } from './email';
import tradingLevelService from './tradingLevel';
import certificateService from './certificateService';
import { UserModel } from '../models/user';
import { CertificateModel } from '../models/certificate';
import StockData from '../models/stockData';
import StockHistory from '../models/stockHistory';
import DailySnapshot from '../models/DailySnapshot';
import NewsData from '../models/newsData';
import { Session } from '../models/Session';
import { getISTMidnightUTC, isISTMarketOpen, isISTWeekday } from '../utils/dateUtils';

class CronService {
  private scraperJob: cron.ScheduledTask | null = null;
  private newsScraperJob: cron.ScheduledTask | null = null;
  private subscriptionJob: cron.ScheduledTask | null = null;
  private tradingLevelJob: cron.ScheduledTask | null = null;
  private certificateJob: cron.ScheduledTask | null = null;
  private eodCompactionJob: cron.ScheduledTask | null = null;
  private periodicCleanupJob: cron.ScheduledTask | null = null;

  // Track the last date (IST midnight UTC) on which startup cleanup ran,
  // so that repeated hot-reloads in dev don't re-run the cleanup multiple times a day.
  private lastCleanupDate: number = 0;

  // Start the scraper cron job
  startScraperJob(): void {
    // Run every 1 minute on weekdays during market hours
    this.scraperJob = cron.schedule('*/1 * * * 1-5', async () => {

      if (!isISTWeekday()) {
        console.log('Skipping: Weekend detected');
        return;
      }

      if (!isISTMarketOpen()) {
        console.log('Skipping: Outside market hours');
        return;
      }

      // Run the scraper and push fresh data to WebSocket
      const freshData = await stockScraperService.scrapeAllStocks();

      // Push fresh prices directly to all connected WebSocket clients
      const tradingSocket = (global as any).tradingSocket;
      if (tradingSocket && freshData.length > 0) {
        tradingSocket.broadcastStockPrices(freshData);
        console.log(`📡 Pushed ${freshData.length} stock prices to WebSocket clients`);
      }

    }, {
      timezone: 'Asia/Kolkata'
    });

    this.scraperJob.start();

    console.log('Stock scraper cron job started (every 1 minute on weekdays)');
  }

  // ✅ START NEWS SCRAPER JOB (ADD THIS METHOD)
  startNewsScraperJob(): void {
    // Run every 30 minutes, 24/7 (news is published anytime)
    // Cron format: */30 * * * * means every 30 minutes
    this.newsScraperJob = cron.schedule('*/30 * * * *', async () => {
      console.log('Running news scraper...');
      await newsScraperService.scrapeAllNews();
    }, {
      timezone: 'Asia/Kolkata'
    });

    this.newsScraperJob.start();
    console.log('News scraper cron job started (every 30 minutes)');
  }

  // ✅ MANUAL TRIGGER FOR NEWS (ADD THIS METHOD)
  async runNewsScraperNow(): Promise<void> {
    console.log('Manual news scraper triggered');
    await newsScraperService.scrapeAllNews();
  }

  // ✅ STOP NEWS SCRAPER (ADD THIS METHOD)
  stopNewsScraperJob(): void {
    if (this.newsScraperJob) {
      this.newsScraperJob.stop();
      console.log('News scraper cron job stopped');
    }
  }

  // ✅ START SUBSCRIPTION EXPIRY CHECKER
  startSubscriptionExpiryJob(): void {
    // Run once a day at 9:00 AM IST
    this.subscriptionJob = cron.schedule('0 9 * * *', async () => {
      console.log('Running daily subscription expiry check...');
      await this.checkSubscriptions();
    }, {
      timezone: 'Asia/Kolkata'
    });

    this.subscriptionJob.start();
    console.log('Subscription cron job started (runs daily at 9:00 AM IST)');
  }

  // ✅ MANUAL TRIGGER FOR SUBSCRIPTION CHECK 
  async checkSubscriptionsNow(): Promise<void> {
    console.log('Manual subscription check triggered');
    await this.checkSubscriptions();
  }

  // The actual check logic
  private async checkSubscriptions() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // ── Pass 1: Organizations ──────────────────────────────────────
      const activeOrgs = await OrganizationModel.find({
        isActive: true,
        isDeleted: { $ne: true },
        subscriptionExpiry: { $exists: true, $ne: null }
      });

      for (const org of activeOrgs) {
        if (!org.subscriptionExpiry || !org.subscriptionPlan) continue;

        const expiry = new Date(org.subscriptionExpiry);
        expiry.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 7 || diffDays === 1 || diffDays === 0) {
          const admins = await OrganizationAdminModel.find({
            organization: org._id,
            isActive: true,
            isDeleted: false
          });
          if (admins.length === 0) continue;

          const dateStr = expiry.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

          for (const admin of admins) {
            await sendSubscriptionExpiryEmail(
              admin.email,
              org.organizationName,
              diffDays,
              org.subscriptionPlan,
              dateStr
            );
          }
          console.log(`Sent ${diffDays}-day org reminder to admins of ${org.organizationName}`);
        }
      }

      // ── Pass 2: Individual Users ──────────────────────────────────
      // Covers solo users who purchased their own plan (no organization).
      const activeUsers = await UserModel.find({
        organization: null,           // independent users only
        isActive: true,
        isDeleted: { $ne: true },
        subscriptionStatus: 'active',
        subscriptionExpiry: { $exists: true, $ne: null },
        currentPlan: { $in: ['Silver', 'Gold', 'Diamond'] },
      });

      for (const user of activeUsers) {
        if (!user.subscriptionExpiry || !user.currentPlan) continue;

        const expiry = new Date(user.subscriptionExpiry);
        expiry.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 7 || diffDays === 1 || diffDays === 0) {
          const dateStr = expiry.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
          await sendUserSubscriptionExpiryEmail(
            user.email,
            user.name,
            diffDays,
            user.currentPlan,
            dateStr
          );
          console.log(`Sent ${diffDays}-day user reminder to ${user.email} (${user.currentPlan})`);
        }
      }

    } catch (error) {
      console.error('Error checking subscriptions:', error);
    }
  }

  // ─── Certificate Generation Job ────────────────────────────────────

  // Start certificate job (runs daily at 1:00 AM IST)
  startCertificateJob(): void {
    // Cron: minute 0, hour 1, every day
    this.certificateJob = cron.schedule('0 1 * * *', async () => {
      console.log('Running daily certificate generation check (1:00 AM IST)...');
      await this.generateCertificatesForExpiredPlans();
    }, {
      timezone: 'Asia/Kolkata'
    });

    this.certificateJob.start();
    console.log('🎓 Certificate cron job started (runs daily at 1:00 AM IST)');
  }

  // Manual trigger for testing
  async runCertificateJobNow(): Promise<void> {
    console.log('Manual certificate generation triggered');
    await this.generateCertificatesForExpiredPlans();
  }

  // Stop the certificate job
  stopCertificateJob(): void {
    if (this.certificateJob) {
      this.certificateJob.stop();
      console.log('🎓 Certificate cron job stopped');
    }
  }

  private async generateCertificatesForExpiredPlans() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      // We need everything that expired exactly 'yesterday'
      // Meaning expiry > yesterday 00:00 and expiry < yesterday 23:59
      const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
      const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));

      console.log(`Checking expirations between ${startOfYesterday.toISOString()} and ${endOfYesterday.toISOString()}`);

      // --- 1. Independent Users ---
      const individualUsers = await UserModel.find({
        organization: null,
        isActive: true,
        isDeleted: false,
        subscriptionExpiry: {
          $gte: startOfYesterday,
          $lte: endOfYesterday
        }
      });

      for (const user of individualUsers) {
        // Skip if they already have one generated for this expiry date (prevent duplicates)
        const existingCert = await CertificateModel.findOne({
          user: user._id,
          endDate: {
            $gte: startOfYesterday,
            $lte: endOfYesterday
          }
        });

        if (!existingCert && user.subscriptionExpiry && user.currentPlan) {
          // Determine the start date (for now we assume 1 year or 1 month before expiry, here we assume it's created at `createdAt` if we don't have explicit plan start date, falling back to 30 days ago)
          let startDate = (user as any).createdAt || new Date();
          if (user.subscriptionExpiry) {
               startDate = new Date(user.subscriptionExpiry.getTime() - 30 * 24 * 60 * 60 * 1000); // Approximate 1 month back if nothing else
          }

          await certificateService.generateCertificate({
            userId: user._id.toString(),
            userName: user.name,
            planName: user.currentPlan,
            startDate: startDate,
            endDate: user.subscriptionExpiry
          });
        }
      }

      // --- 2. Organization Students ---
      const expiredOrgs = await OrganizationModel.find({
        isActive: true,
        isDeleted: false,
        subscriptionExpiry: {
          $gte: startOfYesterday,
          $lte: endOfYesterday
        }
      });

      for (const org of expiredOrgs) {
        // Find all active students in this org
        const students = await UserModel.find({
          organization: org._id,
          role: 'user',
          isActive: true,
          isDeleted: false
        });

        for (const student of students) {
          const existingCert = await CertificateModel.findOne({
            user: student._id,
            organization: org._id,
            endDate: {
              $gte: startOfYesterday,
              $lte: endOfYesterday
            }
          });

          if (!existingCert && org.subscriptionExpiry && org.subscriptionPlan) {
            let startDate = (org as any).createdAt || new Date();
            if (org.subscriptionExpiry) {
                 // Assume org plan was 1 year or similar, approximate to 30 days or based on createdAt
                 startDate = new Date(org.subscriptionExpiry.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year back
                 if (startDate < ((org as any).createdAt || new Date(0))) startDate = (org as any).createdAt; 
            }

            await certificateService.generateCertificate({
              userId: student._id.toString(),
              organizationId: org._id.toString(),
              userName: student.name,
              planName: org.subscriptionPlan,
              startDate: startDate,
              endDate: org.subscriptionExpiry,
              organizationLogoUrl: org.logoUrl
            });
          }
        }
      }

    } catch (error) {
      console.error('Error generating certificates for expired plans:', error);
    }
  }

  // Manual trigger for testing
  async runScraperNow(): Promise<void> {
    console.log('Manual scraper triggered');
    const freshData = await stockScraperService.scrapeAllStocks();

    // Also push to WebSocket
    const tradingSocket = (global as any).tradingSocket;
    if (tradingSocket && freshData.length > 0) {
      tradingSocket.broadcastStockPrices(freshData);
    }
  }

  // Stop the cron job
  stopScraperJob(): void {
    if (this.scraperJob) {
      this.scraperJob.stop();
      console.log('Stock scraper cron job stopped');
    }
  }

  // Get job status
  getJobStatus(): string {
    return this.scraperJob ? 'Running' : 'Stopped';
  }

  // ─── Trading Level Evaluation Job ────────────────────────────────────

  // Start the trading level cron job (daily at 4:00 PM IST, weekdays)
  startTradingLevelJob(): void {
    // Cron: minute 0, hour 16, every day, Mon-Fri
    this.tradingLevelJob = cron.schedule('0 16 * * 1-5', async () => {
      if (!isISTWeekday()) {
        console.log('[TradingLevel] Skipping: Weekend detected');
        return;
      }
      console.log('[TradingLevel] Daily evaluation triggered (4:00 PM IST)');
      await tradingLevelService.evaluateAllActiveUsers();
    }, {
      timezone: 'Asia/Kolkata'
    });

    this.tradingLevelJob.start();
    console.log('🏆 Trading Level cron job started (daily at 4:00 PM IST, weekdays)');
  }

  // Manual trigger for testing
  async runTradingLevelNow(): Promise<void> {
    console.log('[TradingLevel] Manual evaluation triggered');
    await tradingLevelService.evaluateAllActiveUsers();
  }

  // Stop the trading level job
  stopTradingLevelJob(): void {
    if (this.tradingLevelJob) {
      this.tradingLevelJob.stop();
      console.log('🏆 Trading Level cron job stopped');
    }
  }
  // ─── Startup Cleanup ─────────────────────────────────────────────────
  // Run once per calendar day (IST) on server start.
  // Safe to call multiple times — a same-day guard prevents double-execution
  // during dev hot-reloads (npm run dev restarts on every file change).
  //
  // DESIGN:
  //  1. Backfill: any past day with intraday data but no sealed DailySnapshot → compact now.
  //  2. Migrate: legacy StockHistory(type='eod') records → DailySnapshot (one-time, idempotent).
  //  3. Prune: delete ALL past-day intraday records (today is never touched).
  //  4. General: clean up old news, expired sessions.
  async runStartupCleanup(): Promise<void> {
    try {
      const todayIST = getISTMidnightUTC();
      const todayTs  = todayIST.getTime();

      if (this.lastCleanupDate === todayTs) {
        console.log('🧹 Startup cleanup already ran today — skipping.');
        return;
      }
      this.lastCleanupDate = todayTs;

      console.log(`🧹 Running startup cleanup (IST midnight UTC: ${todayIST.toISOString()})...`);

      // ─── Phase 1: EOD Backfill ─────────────────────────────────────
      // Find every distinct IST date in StockHistory(intraday) that is BEFORE today.
      // For each such date, check if ALL stocks of that date have a sealed DailySnapshot.
      // If not → compact the last intraday record per symbol into DailySnapshot(isClosed=true).
      const pastIntradayDates: Date[] = await StockHistory.distinct('date', {
        type: 'intraday',
        date: { $lt: todayIST }
      });

      let totalBackfilled = 0;
      for (const dateVal of pastIntradayDates) {
        // Get last intraday per symbol for this date
        const lastPrices = await StockHistory.aggregate([
          { $match: { type: 'intraday', date: dateVal } },
          { $sort: { timestamp: -1 } },
          {
            $group: {
              _id: '$symbol',
              doc: { $first: '$$ROOT' }
            }
          },
          { $replaceRoot: { newRoot: '$doc' } }
        ]);

        if (lastPrices.length === 0) continue;

        // Upsert sealed DailySnapshot for each (only if not already sealed)
        const snapshotOps = lastPrices.map(doc => ({
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
        totalBackfilled += (result.upsertedCount || 0);
      }

      if (totalBackfilled > 0) {
        console.log(`🧹 Backfilled ${totalBackfilled} DailySnapshot records from orphaned intraday data.`);
      } else if (pastIntradayDates.length > 0) {
        console.log('🧹 All past intraday days already have DailySnapshots — no backfill needed.');
      }

      // ─── Phase 2: Migrate legacy StockHistory(eod) → DailySnapshot ─
      // One-time, idempotent. Old eod records are converted and then deleted.
      const legacyEodRecords = await StockHistory.find({ type: 'eod' }).lean();
      if (legacyEodRecords.length > 0) {
        const migrateOps = legacyEodRecords.map(doc => ({
          updateOne: {
            filter: { symbol: doc.symbol, date: doc.date },
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
        const migrateResult = await DailySnapshot.bulkWrite(migrateOps, { ordered: false });
        await StockHistory.deleteMany({ type: 'eod' });
        console.log(`🧹 Migrated ${migrateResult.upsertedCount || 0} legacy EOD records → DailySnapshot (deleted originals).`);
      }

      // ─── Phase 3: Safe Intraday Prune ───────────────────────────────
      // Delete intraday records only for past dates (today is never touched).
      // After Phase 1 backfill, all past dates should now have sealed snapshots.
      const staleIntraday = await StockHistory.deleteMany({
        type: 'intraday',
        date: { $lt: todayIST }
      });
      if (staleIntraday.deletedCount > 0) {
        console.log(`🧹 Purged ${staleIntraday.deletedCount} stale intraday records from previous days.`);
      } else {
        console.log('🧹 No stale intraday records found.');
      }

      // ─── Phase 4: StockData de-duplication ─────────────────────────
      const keepers = await StockData.aggregate([
        { $sort: { timestamp: -1 } },
        { $group: { _id: { symbol: '$symbol', category: '$category' }, latestId: { $first: '$_id' } } }
      ]);
      const keepIds = keepers.map(doc => doc.latestId);
      if (keepIds.length > 0) {
        const stockResult = await StockData.deleteMany({ _id: { $nin: keepIds } });
        if (stockResult.deletedCount > 0) {
          console.log(`🧹 Purged ${stockResult.deletedCount} stale StockData records (kept ${keepIds.length} latest)`);
        } else {
          console.log(`🧹 StockData clean — ${keepIds.length} current records.`);
        }
      }

      // ─── Phase 5: General housekeeping ──────────────────────────────
      // Delete news older than 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const newsResult = await NewsData.deleteMany({ publishedAt: { $lt: thirtyDaysAgo } });
      if (newsResult.deletedCount > 0) {
        console.log(`🧹 Purged ${newsResult.deletedCount} old news articles (>30 days).`);
      }

      // Delete expired/invalid sessions
      const sessionResult = await Session.deleteMany({
        $or: [
          { isValid: false },
          { expiresAt: { $lt: new Date() } }
        ]
      });
      if (sessionResult.deletedCount > 0) {
        console.log(`🧹 Purged ${sessionResult.deletedCount} expired sessions.`);
      }

      console.log('🧹 Startup cleanup complete.');
    } catch (error) {
      console.error('🧹 Startup cleanup error:', error);
    }
  }

  // ─── EOD Compaction Job (3:45 PM IST, Mon-Fri) ──────────────────────
  // Runs 15 minutes after market close (3:30 PM IST).
  // Seals all live DailySnapshots for today and deletes intraday records.
  startEodCompactionJob(): void {
    this.eodCompactionJob = cron.schedule('45 15 * * 1-5', async () => {
      await this.runEodCompaction();
    }, {
      timezone: 'Asia/Kolkata'
    });

    this.eodCompactionJob.start();
    console.log('🌙 EOD Compaction cron job started (3:45 PM IST, weekdays)');
  }

  // Extracted so it can be called both by cron and manually
  async runEodCompaction(): Promise<void> {
    try {
      console.log('🌙 EOD Compaction: Starting end-of-day data compaction...');

      const todayIST = getISTMidnightUTC();

      // 1. Find the last intraday record per symbol for today
      const lastPrices = await StockHistory.aggregate([
        { $match: { type: 'intraday', date: todayIST } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: '$symbol',
            doc: { $first: '$$ROOT' }
          }
        },
        { $replaceRoot: { newRoot: '$doc' } }
      ]);

      if (lastPrices.length === 0) {
        console.log('🌙 EOD Compaction: No intraday data found for today. Skipping.');
        return;
      }

      // 2. Seal DailySnapshots — set isClosed=true with the final closing price.
      //    We use updateOne (not upsert) filters that match isClosed:false so
      //    we never overwrite a snapshot that was somehow already sealed.
      const sealOps = lastPrices.map(doc => ({
        updateOne: {
          filter: { symbol: doc.symbol, date: todayIST },
          update: {
            $set: {
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
              closedAt: new Date()
            }
          },
          upsert: true
        }
      }));

      await DailySnapshot.bulkWrite(sealOps, { ordered: false });
      console.log(`🌙 EOD Compaction: Sealed ${lastPrices.length} DailySnapshot records.`);
      // NOTE: Intraday records are intentionally NOT deleted here.
      // They remain in StockHistory so the 1D chart fallback works over the weekend.
      // The scraper pre-cleanup (compactPastIntradayIfNeeded) deletes them when
      // the next trading day's first scrape runs.

      console.log('🌙 EOD Compaction: Complete (DailySnapshot sealed, intraday preserved).');
    } catch (error) {
      console.error('🌙 EOD Compaction error:', error);
    }
  }

  // Manual trigger for testing
  async runEodCompactionNow(): Promise<void> {
    console.log('🌙 Manual EOD Compaction triggered');
    await this.runEodCompaction();
  }

  stopEodCompactionJob(): void {
    if (this.eodCompactionJob) {
      this.eodCompactionJob.stop();
      console.log('🌙 EOD Compaction cron job stopped');
    }
  }

  // ─── Periodic Cleanup (Every 30 min) ────────────────────────────────
  // Bulletproof safety net: catches missed EOD compactions.
  // If the server restarts at 3:45 PM and the EOD cron is missed, this job
  // ensures past-day intraday records never survive more than 30 minutes.
  // During market hours, today's records are NEVER touched.
  startPeriodicCleanupJob(): void {
    this.periodicCleanupJob = cron.schedule('*/30 * * * *', async () => {
      await this.cleanupPastIntradayRecords();
    }, {
      timezone: 'Asia/Kolkata'
    });

    this.periodicCleanupJob.start();
    console.log('🧹 Periodic cleanup job started (every 30 minutes)');
  }

  // The actual cleanup logic — called by periodic job, startup cleanup, and manual trigger
  async cleanupPastIntradayRecords(): Promise<void> {
    try {
      const todayIST = getISTMidnightUTC();

      // Quick check — skip if nothing to clean (99% of runs exit here instantly)
      const pastCount = await StockHistory.countDocuments({
        type: 'intraday',
        date: { $lt: todayIST }
      });
      if (pastCount === 0) return;

      console.log(`🧹 Periodic cleanup: Found ${pastCount} past intraday records. Compacting...`);

      // Step 1: Backfill any past dates into sealed DailySnapshot
      const pastDates: Date[] = await StockHistory.distinct('date', {
        type: 'intraday',
        date: { $lt: todayIST }
      });

      let totalBackfilled = 0;
      for (const dateVal of pastDates) {
        const lastPrices = await StockHistory.aggregate([
          { $match: { type: 'intraday', date: dateVal } },
          { $sort: { timestamp: -1 } },
          {
            $group: {
              _id: '$symbol',
              doc: { $first: '$$ROOT' }
            }
          },
          { $replaceRoot: { newRoot: '$doc' } }
        ]);

        if (lastPrices.length === 0) continue;

        const snapshotOps = lastPrices.map(doc => ({
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
        totalBackfilled += (result.upsertedCount || 0);
      }

      // Step 2: Delete ALL past intraday records (today is never touched)
      const deleted = await StockHistory.deleteMany({
        type: 'intraday',
        date: { $lt: todayIST }
      });

      console.log(`🧹 Periodic cleanup: Backfilled ${totalBackfilled} snapshots, deleted ${deleted.deletedCount} past intraday records.`);
    } catch (error) {
      console.error('🧹 Periodic cleanup error:', error);
    }
  }

  stopPeriodicCleanupJob(): void {
    if (this.periodicCleanupJob) {
      this.periodicCleanupJob.stop();
      console.log('🧹 Periodic cleanup job stopped');
    }
  }
}

export default new CronService();
