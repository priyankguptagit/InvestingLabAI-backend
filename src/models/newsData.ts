import mongoose from 'mongoose';

const newsDataSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  url: {
    type: String,
    required: true,
    unique: true // Prevent duplicate news
  },
  source: {
    type: String,
    enum: ['NSE', 'MONEYCONTROL', 'ECONOMIC_TIMES'],
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: ['MARKET', 'STOCKS', 'ECONOMY', 'IPO', 'COMMODITIES', 'FOREX', 'MUTUAL_FUNDS', 'GENERAL'],
    default: 'GENERAL',
    index: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  publishedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  relatedSymbols: [{
    type: String // Stock symbols mentioned in news
  }],
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
newsDataSchema.index({ source: 1, publishedAt: -1 });
newsDataSchema.index({ category: 1, publishedAt: -1 });
newsDataSchema.index({ relatedSymbols: 1, publishedAt: -1 });

export default mongoose.model('NewsData', newsDataSchema);
