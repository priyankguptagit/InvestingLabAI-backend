import mongoose, { Schema, Document } from 'mongoose';

export interface IInquiry extends Document {
  name: string;
  email: string;
  mobile: string;
  description: string;
  inquiryType: string;
  createdAt: Date;
}

const InquirySchema: Schema = new Schema({
  name: {
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
  description: {
    type: String,
    required: true
  },
  inquiryType: {
    type: String,
    required: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

export const InquiryModel = mongoose.model<IInquiry>('Inquiry', InquirySchema);
