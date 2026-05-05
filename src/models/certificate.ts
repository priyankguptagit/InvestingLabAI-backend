import mongoose, { Schema, Document } from 'mongoose';

export interface ICertificate extends Document {
  user: mongoose.Types.ObjectId;
  organization?: mongoose.Types.ObjectId;
  certificateNumber: string;
  certificateUrl: string; // URL/path where the PDF is stored
  startDate: Date;
  endDate: Date;
  issuedAt: Date;
  planName: string;
  type: string; // e.g., 'course_completion', 'subscription_expiry'
}

const CertificateSchema: Schema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization'
  },
  certificateNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  certificateUrl: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  issuedAt: {
    type: Date,
    default: Date.now
  },
  planName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'subscription_expiry'
  }
}, {
  timestamps: true
});

export const CertificateModel = mongoose.model<ICertificate>('Certificate', CertificateSchema);
