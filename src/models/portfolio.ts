import mongoose, { Schema, Document } from 'mongoose';

export interface IPortfolioHolding extends Document {
  userId: mongoose.Types.ObjectId;
  symbol: string;
  stockName: string;
  quantity: number;
  averageBuyPrice: number;
  totalInvested: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  
  // AI Insights
  aiHoldingAnalysis?: string;
  aiRecommendedAction?: 'HOLD' | 'BUY_MORE' | 'SELL' | 'STOP_LOSS';
  lastAIAnalysisDate?: Date;
  
  category: 'NIFTY50' | 'NIFTY100' | 'ETF';
  lastUpdated: Date;
}

const PortfolioHoldingSchema: Schema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  symbol: { type: String, required: true, uppercase: true },
  stockName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  averageBuyPrice: { type: Number, required: true },
  totalInvested: { type: Number, required: true },
  currentPrice: { type: Number, required: true },
  currentValue: { type: Number, required: true },
  unrealizedPL: { type: Number, default: 0 },
  unrealizedPLPercent: { type: Number, default: 0 },
  
  // AI Insights
  aiHoldingAnalysis: { type: String },
  aiRecommendedAction: { 
    type: String, 
    enum: ['HOLD', 'BUY_MORE', 'SELL', 'STOP_LOSS'] 
  },
  lastAIAnalysisDate: { type: Date },
  
  category: { type: String, enum: ['NIFTY50', 'NIFTY100', 'ETF'] },
  lastUpdated: { type: Date, default: Date.now }
}, { 
  timestamps: true 
});

// Ensure one holding per user per symbol
PortfolioHoldingSchema.index({ userId: 1, symbol: 1 }, { unique: true });

export default mongoose.model<IPortfolioHolding>('PortfolioHolding', PortfolioHoldingSchema);

