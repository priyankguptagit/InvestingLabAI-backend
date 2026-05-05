import mongoose, { Schema, Document } from 'mongoose';
import type { PlanName, Duration } from '../config/pricing.config';

export type PaymentStatus = 'created' | 'paid' | 'failed';

export interface IPaymentRecord extends Document {
  userId: mongoose.Types.ObjectId;
  razorpayOrderId: string;      // idempotency key — unique per order
  razorpayPaymentId?: string;   // filled on successful capture/verify
  planName: PlanName;
  duration: Duration;           // months purchased (1 | 3 | 6)
  amountPaise: number;          // exact amount charged in paise
  currency: 'INR';
  status: PaymentStatus;
  referralCode?: string;
  discountPaise?: number;       // discount applied in paise
  activatedAt?: Date;           // when subscription was turned on
  expiresAt?: Date;             // subscription expiry stored for reference
  webhookEvents: string[];      // log of all received webhook event types
  createdAt: Date;
  updatedAt: Date;
}

const PaymentRecordSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true, // ← idempotency key: one record per order
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
    },
    planName: {
      type: String,
      enum: ['Silver', 'Gold', 'Diamond'],
      required: true,
    },
    duration: {
      type: Number,
      enum: [1, 3, 6],
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed'],
      default: 'created',
      index: true,
    },
    referralCode: {
      type: String,
      trim: true,
    },
    discountPaise: {
      type: Number,
      min: 0,
    },
    activatedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    webhookEvents: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// Compound index for admin lookups: all payments for a user, newest first
PaymentRecordSchema.index({ userId: 1, createdAt: -1 });

export const PaymentRecordModel = mongoose.model<IPaymentRecord>(
  'PaymentRecord',
  PaymentRecordSchema
);
