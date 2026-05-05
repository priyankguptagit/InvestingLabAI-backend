import mongoose from 'mongoose';

const stockHistorySchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['intraday', 'eod'],
    required: true
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
  date: {
    type: Date,
    required: true  // Trading date (normalized to midnight)
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// For fetching a stock's history (intraday or EOD) sorted by time
stockHistorySchema.index({ symbol: 1, type: 1, timestamp: -1 });
// For the EOD cleanup job to quickly find/delete all intraday records for a date
stockHistorySchema.index({ type: 1, date: 1 });

export default mongoose.model('StockHistory', stockHistorySchema);
