import mongoose, { Schema, Document } from 'mongoose';

export interface IChatMessage extends Document {
  userId: mongoose.Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    stockSymbol?: string;
    queryType?: 'general' | 'stock-analysis' | 'portfolio-recommendation' | 'market-trends';
    tokensUsed?: number;  // Track AI API usage
    responseTime?: number; // Performance monitoring
  };
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema: Schema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000  // Prevent abuse
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  metadata: {
    stockSymbol: {
      type: String,
      index: true  // For stock-specific query analysis
    },
    queryType: {
      type: String,
      enum: ['general', 'stock-analysis', 'portfolio-recommendation', 'market-trends'],
      index: true  // For analytics
    },
    tokensUsed: Number,
    responseTime: Number
  }
}, {
  timestamps: true  // Adds createdAt, updatedAt automatically
});

// Compound index for efficient user conversation retrieval
chatMessageSchema.index({ userId: 1, timestamp: -1 });

// Index for admin analytics (most popular query types)
chatMessageSchema.index({ 'metadata.queryType': 1, timestamp: -1 });

// TTL Index: Auto-delete messages older than 90 days (optional, comment out if not needed)
// chatMessageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

export const ChatMessageModel = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
