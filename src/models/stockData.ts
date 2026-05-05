import mongoose from 'mongoose';

const stockDataSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['NIFTY50', 'NIFTY100', 'NIFTY500', 'ETF'],
    required: true,
    index: true
  },
  subCategory: {
    type: String,
    enum: ['COMMODITY', 'BOND', 'SECTOR', 'OTHER'],
    required: false
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
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Unique: one document per symbol per category (upsert pattern)
stockDataSchema.index({ symbol: 1, category: 1 }, { unique: true });
// For filtering by category (e.g. "show all NIFTY50 stocks")
stockDataSchema.index({ category: 1 });

export default mongoose.model('StockData', stockDataSchema);
