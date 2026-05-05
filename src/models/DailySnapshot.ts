import mongoose from 'mongoose';

/**
 * DailySnapshot — permanent, upsert-safe daily record per stock per IST trading day.
 *
 * Design principles:
 *  1. Unique (symbol + date) — one document per stock per calendar day (IST).
 *  2. `isClosed = false` while market is open → price = latest live price (updated every scrape).
 *  3. `isClosed = true` after market close → price = official closing price.
 *     Once sealed, the document is NEVER mutated again.
 *  4. Used by the 1W / 1M / 1Y history views.
 *  5. Written idempotently via upsert — safe across server restarts, hot-reloads, and retries.
 */
const dailySnapshotSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['NIFTY50', 'NIFTY100', 'NIFTY500', 'ETF'],
    required: true
  },
  date: {
    type: Date,
    required: true   // IST midnight expressed as UTC (from getISTMidnightUTC)
  },
  price: {
    type: Number,
    required: true
  },
  open: Number,
  high: Number,
  low: Number,
  previousClose: Number,
  change: Number,
  changePercent: Number,
  volume: Number,
  marketCap: Number,
  isClosed: {
    type: Boolean,
    default: false    // false = live/in-progress, true = sealed EOD
  },
  closedAt: {
    type: Date,
    default: null     // UTC timestamp when isClosed was set to true
  }
}, {
  timestamps: true    // adds createdAt + updatedAt automatically
});

// ─── Indexes ─────────────────────────────────────────────────────────
// Primary: one document per stock per calendar day (upsert target)
dailySnapshotSchema.index({ symbol: 1, date: 1 }, { unique: true });
// For querying a stock's multi-day history sorted by date
dailySnapshotSchema.index({ symbol: 1, date: -1 });
// For the compaction job to find open snapshots to seal
dailySnapshotSchema.index({ isClosed: 1, date: 1 });

export default mongoose.model('DailySnapshot', dailySnapshotSchema);
