import mongoose, { Schema, Document } from 'mongoose';

export interface IPaperTrade extends Document {
  userId: mongoose.Types.ObjectId;
  symbol: string;
  stockName: string;
  type: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP_LOSS';
  quantity: number;
  price: number; // Execution price
  limitPrice?: number; // For limit orders
  stopLossPrice?: number; // For stop loss orders
  totalAmount: number;
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'REJECTED';
  executedAt?: Date;
  cancelledAt?: Date;
  rejectionReason?: string;
  reason?: string; // Student's thesis/reason for making this trade
  
  // AI Analysis Integration
  aiRecommendation?: string;
  aiConfidenceScore?: number;
  aiRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // P&L tracking
  currentPrice?: number;
  unrealizedPL?: number;
  realizedPL?: number;
  
  // Metadata
  category: 'NIFTY50' | 'NIFTY100' | 'ETF';
  tradingSession: string; // Date identifier
}

const PaperTradeSchema: Schema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  symbol: { type: String, required: true, uppercase: true, index: true },
  stockName: { type: String, required: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  orderType: { 
    type: String, 
    enum: ['MARKET', 'LIMIT', 'STOP_LOSS'], 
    default: 'MARKET' 
  },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  limitPrice: { type: Number, min: 0 },
  stopLossPrice: { type: Number, min: 0 },
  totalAmount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'EXECUTED', 'CANCELLED', 'REJECTED'], 
    default: 'PENDING' 
  },
  executedAt: { type: Date },
  cancelledAt: { type: Date },
  rejectionReason: { type: String },
  reason: { type: String }, // Student's thesis/reason for making this trade
  
  // AI Integration
  aiRecommendation: { type: String },
  aiConfidenceScore: { type: Number, min: 0, max: 100 },
  aiRiskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'] },
  
  // P&L
  currentPrice: { type: Number },
  unrealizedPL: { type: Number, default: 0 },
  realizedPL: { type: Number, default: 0 },
  
  // Metadata
  category: { type: String, enum: ['NIFTY50', 'NIFTY100', 'ETF'] },
  tradingSession: { type: String, required: true }
}, { 
  timestamps: true 
});

// Compound indexes for efficient queries
PaperTradeSchema.index({ userId: 1, createdAt: -1 });
PaperTradeSchema.index({ userId: 1, symbol: 1 });
PaperTradeSchema.index({ userId: 1, status: 1 });

export const PaperTradeModel = mongoose.model<IPaperTrade>('PaperTrade', PaperTradeSchema);
