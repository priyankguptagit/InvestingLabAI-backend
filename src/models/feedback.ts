import mongoose, { Schema, Document } from 'mongoose';

export interface IFactorRating {
  factor: string;
  score: number;
}

export interface IFeedback extends Document {
  authorId: mongoose.Types.ObjectId;
  authorModel: 'User' | 'OrganizationAdmin' | 'DepartmentCoordinator';
  authorName: string;
  authorEmail: string;
  /**
   * 'multi_factor' — new structured experience rating (6 factor wizard)
   * 'bug' | 'feature_request' | 'general' — legacy / report paths
   * 'testimonial' — legacy single-rating testimonial (backward-compat)
   */
  type: 'multi_factor' | 'testimonial' | 'bug' | 'feature_request' | 'general';
  content?: string;
  /** Per-factor scores (used when type === 'multi_factor') */
  factorRatings: IFactorRating[];
  /** Auto-computed mean of factorRatings, or the legacy single testimonial rating */
  rating?: number;
  portal: 'user' | 'organization' | 'coordinator' | 'admin' | 'public';
  status: 'pending' | 'approved' | 'rejected' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}

const FactorRatingSchema = new Schema<IFactorRating>(
  {
    factor: { type: String, required: true },
    score:  { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const FeedbackSchema: Schema = new Schema(
  {
    authorId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'authorModel',
    },
    authorModel: {
      type: String,
      required: true,
      enum: ['User', 'OrganizationAdmin', 'DepartmentCoordinator'],
    },
    authorName:  { type: String, required: true },
    authorEmail: { type: String, required: true },
    type: {
      type: String,
      enum: ['multi_factor', 'testimonial', 'bug', 'feature_request', 'general'],
      required: true,
    },
    // Optional free-text (required only for bug/feature_request/general, optional for multi_factor)
    content: { type: String },
    // Per-factor breakdown (multi_factor only)
    factorRatings: { type: [FactorRatingSchema], default: [] },
    // Computed average (multi_factor) or direct value (testimonial legacy)
    rating: { type: Number, min: 1, max: 5 },
    portal: {
      type: String,
      enum: ['user', 'organization', 'coordinator', 'admin', 'public'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'resolved'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export const FeedbackModel = mongoose.model<IFeedback>('Feedback', FeedbackSchema);
