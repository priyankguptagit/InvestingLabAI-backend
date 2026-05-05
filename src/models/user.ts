import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash?: string;
  role: 'user' | 'organization_admin' | 'department_coordinator';
  preferredCurrency?: string;
  themePreference?: 'light' | 'dark' | 'system';
  avatar?: string;

  isVerified: boolean;
  isActive: boolean;
  verificationToken?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  lastLogin?: Date;
  lastActive?: Date;

  // AI Usage Tracking
  aiNewsUsageCount?: number;
  aiPortfolioUsageCount?: number;
  aiUsageLastReset?: Date;

  // Organization Relationship
  organization?: mongoose.Types.ObjectId;
  department?: mongoose.Types.ObjectId;
  organizationApprovalStatus?: 'pending' | 'approved' | 'rejected';
  ApprovedBy?: mongoose.Types.ObjectId;
  approvedByType?: 'organization_admin' | 'department_coordinator';
  ApprovedAt?: Date;
  RejectedReason?: string;


  // Subscription Fields
  subscriptionId?: string;
  subscriptionStatus?: 'active' | 'created' | 'authenticated' | 'past_due' | 'completed' | 'cancelled' | 'paused' | 'expired' | 'pending' | 'halted';
  currentPlan?: 'Silver' | 'Gold' | 'Diamond' | 'Free';
  subscriptionExpiry?: Date;

  // Trial Fields
  hasUsedTrial?: boolean;
  isOnTrial?: boolean;
  trialEndDate?: Date;

  // ✨ Add these two properties:
  isDeleted?: boolean;
  deletedAt?: Date;

  // Paper Trading Fields
  virtualBalance: number;
  initialVirtualBalance: number;
  virtualBalanceLastReset?: Date;
  totalPaperTradesCount: number;
  profitablePaperTrades: number;
  totalPaperPL: number;
  portfolioTurnover: number;
  maxDrawdown: number;
  bestPaperTrade?: number;
  worstPaperTrade?: number;
  tradingLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';

  // Reconciliation Report
  portfolioReport?: {
    analysis: string;
    generatedAt: Date;
  };

  // Teacher Review (after Reconcile)
  teacherReview?: {
    factor1Rating: number;   // 1–5: Portfolio Health Assessment
    factor2Rating: number;   // 1–5: Diversification Analysis
    factor3Rating: number;   // 1–5: Risk Assessment
    aggregateScore: number;  // ((f1+f2+f3)/3)*20 → out of 100
    suggestions: string;     // Teacher's free-text feedback
    reviewedAt: Date;
    reviewedBy: mongoose.Types.ObjectId;
  };
}


const UserSchema: Schema = new Schema({
  name: {
    type: String,
    trim: true,
    default: "User"
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  passwordHash: {
    type: String,
    select: false
  },

  role: {
    type: String,
    enum: ['user', 'organization_admin', 'department_coordinator'],

    default: 'user'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: { type: String, select: false },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
  lastLogin: { type: Date },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActive: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },

  // Organization Relationship
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization'
  },
  department: {
    type: Schema.Types.ObjectId,
    ref: 'Department'
  },
  organizationApprovalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected']
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    refPath: 'approvedByType'
  },
  approvedByType: {
    type: String,
    enum: ['organization_admin', 'department_coordinator']
  },
  approvedAt: { type: Date },
  rejectedReason: { type: String },


  preferredCurrency: { type: String, default: 'INR' },
  avatar: { type: String, default: null },

  // Subscription Fields (New)
  subscriptionId: { type: String },
  subscriptionStatus: { type: String },
  currentPlan: { type: String, enum: ['Silver', 'Gold', 'Diamond', 'Free'], default: 'Free' },
  subscriptionExpiry: { type: Date },

  // AI Usage Tracking
  aiNewsUsageCount: { type: Number, default: 0 },
  aiPortfolioUsageCount: { type: Number, default: 0 },
  aiUsageLastReset: { type: Date, default: Date.now },

  // Trial Fields
  hasUsedTrial: { type: Boolean, default: false },
  isOnTrial: { type: Boolean, default: false },
  trialEndDate: { type: Date },

  virtualBalance: { type: Number, default: 100000 }, // ₹1,00,000 default
  initialVirtualBalance: { type: Number, default: 100000 },
  virtualBalanceLastReset: { type: Date },
  totalPaperTradesCount: { type: Number, default: 0 },
  profitablePaperTrades: { type: Number, default: 0 },
  totalPaperPL: { type: Number, default: 0 },
  portfolioTurnover: { type: Number, default: 0 },
  maxDrawdown: { type: Number, default: 0 },
  bestPaperTrade: { type: Number },
  worstPaperTrade: { type: Number },
  tradingLevel: {
    type: String,
    enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'],
    default: 'BEGINNER'
  },

  // Reconciliation Report
  portfolioReport: {
    analysis: { type: String },
    generatedAt: { type: Date }
  },

  // Teacher Review
  teacherReview: {
    factor1Rating: { type: Number, min: 1, max: 5 },
    factor2Rating: { type: Number, min: 1, max: 5 },
    factor3Rating: { type: Number, min: 1, max: 5 },
    aggregateScore: { type: Number },
    suggestions: { type: String, default: '' },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'DepartmentCoordinator' }
  },
},

  {
    timestamps: true
  });

//Checking some new Git functionalities
export const UserModel = mongoose.model<IUser>('User', UserSchema);