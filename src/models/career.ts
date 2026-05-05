import mongoose, { Schema, Document } from 'mongoose';

export interface ICareerApplication extends Document {
  fullName: string;
  email: string;
  mobile: string;
  inquiryType: string; // Department
  description: string; // Cover Letter / Why us?
  resumeUrl: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const CareerSchema: Schema = new Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  mobile: {
    type: String,
    required: true,
    trim: true
  },
  inquiryType: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  resumeUrl: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Reviewing', 'Interviewed', 'Hired', 'Rejected'],
    default: 'Pending'
  }
}, {
  timestamps: true
});

export const CareerModel = mongoose.model<ICareerApplication>('Career', CareerSchema);
