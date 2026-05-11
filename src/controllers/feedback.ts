import { Request, Response } from 'express';
import { FeedbackModel } from '../models/feedback';
import { asyncHandler } from '../common/errors/errorHandler';
import { z } from 'zod';

// ─── Validation Schemas ────────────────────────────────────────────────────

const factorRatingSchema = z.object({
  factor: z.string().min(1),
  score: z.number().int().min(1).max(5),
});

const VALID_FACTORS = [
  'overall_experience',
  'ease_of_use',
  'data_accuracy',
  'performance_speed',
  'features_coverage',
  'support_reliability',
] as const;

// ── Schema for creating new feedback ────────────────────────────────────────
const submitFeedbackSchema = z.discriminatedUnion('type', [
  // New multi-factor experience rating
  z.object({
    type: z.literal('multi_factor'),
    portal: z.enum(['user', 'organization', 'coordinator', 'public']),
    factorRatings: z
      .array(factorRatingSchema)
      .length(6, 'All 6 factor ratings are required')
      .refine(
        (ratings) => VALID_FACTORS.every((f) => ratings.some((r) => r.factor === f)),
        { message: 'All 6 required factors must be rated' }
      ),
    content: z.string().max(2000).optional(),
  }),
  // Bug / feature_request / general
  z.object({
    type: z.enum(['bug', 'feature_request', 'general']),
    portal: z.enum(['user', 'organization', 'coordinator', 'public']),
    content: z.string().min(5, 'Content must be at least 5 characters').max(2000),
    factorRatings: z.undefined().optional(),
    rating: z.undefined().optional(),
  }),
  // Legacy testimonial (backward-compat)
  z.object({
    type: z.literal('testimonial'),
    portal: z.enum(['user', 'organization', 'coordinator', 'public']),
    content: z.string().min(5, 'Content must be at least 5 characters').max(2000),
    rating: z.number().int().min(1).max(5).optional(),
    factorRatings: z.undefined().optional(),
  }),
]);

// ── Schema for editing own pending feedback ──────────────────────────────────
const editFeedbackSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('multi_factor'),
    factorRatings: z
      .array(factorRatingSchema)
      .length(6, 'All 6 factor ratings are required')
      .refine(
        (ratings) => VALID_FACTORS.every((f) => ratings.some((r) => r.factor === f)),
        { message: 'All 6 required factors must be rated' }
      ),
    content: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.enum(['bug', 'feature_request', 'general']),
    content: z.string().min(5, 'Content must be at least 5 characters').max(2000),
    factorRatings: z.undefined().optional(),
  }),
  z.object({
    type: z.literal('testimonial'),
    content: z.string().min(5).max(2000),
    rating: z.number().int().min(1).max(5).optional(),
    factorRatings: z.undefined().optional(),
  }),
]);

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'resolved']),
});

// ─── Controller ────────────────────────────────────────────────────────────

export class FeedbackController {

  // ── Submit new feedback ────────────────────────────────────────────────────
  submitFeedback = asyncHandler(async (req: Request, res: Response) => {
    const parsed = submitFeedbackSchema.parse(req.body);
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let authorModel: 'User' | 'OrganizationAdmin' | 'DepartmentCoordinator' | 'CompanyMember' = 'User';
    if (user.role === 'organization_admin') authorModel = 'OrganizationAdmin';
    else if (user.role === 'department_coordinator') authorModel = 'DepartmentCoordinator';

    let computedRating: number | undefined;
    if (parsed.type === 'multi_factor' && parsed.factorRatings?.length) {
      const sum = parsed.factorRatings.reduce((acc, r) => acc + r.score, 0);
      computedRating = Math.round((sum / parsed.factorRatings.length) * 10) / 10;
    } else if (parsed.type === 'testimonial' && parsed.rating) {
      computedRating = parsed.rating;
    }

    // ── One-time guard for experience ratings ────────────────────────────────
    if (parsed.type === 'multi_factor') {
      const existingRating = await FeedbackModel.findOne({
        authorId: user.id || user._id,
        type: 'multi_factor',
      });
      if (existingRating) {
        return res.status(409).json({
          success: false,
          message:
            'You have already submitted an experience rating. You can edit your existing rating from the My Feedback page.',
        });
      }
    }

    const feedback = await FeedbackModel.create({
      authorId: user.id || user._id,
      authorModel,
      authorName: user.name || 'Anonymous',
      authorEmail: user.email,
      type: parsed.type,
      content: parsed.content,
      factorRatings: parsed.factorRatings ?? [],
      rating: computedRating,
      portal: parsed.portal,
    });

    res.status(201).json({ success: true, message: 'Feedback submitted successfully', feedback });
  });

  // ── Get current user's own submissions ────────────────────────────────────
  getMyFeedbacks = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const feedbacks = await FeedbackModel.find({ authorId: user.id || user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({ success: true, feedbacks });
  });

  // ── Edit own pending feedback ─────────────────────────────────────────────
  updateMyFeedback = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = (req as any).user;
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const feedback = await FeedbackModel.findOne({ _id: id, authorId: user.id || user._id });
    if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found' });

    if (feedback.status !== 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Feedback can only be edited while it is pending review.',
      });
    }

    const parsed = editFeedbackSchema.parse(req.body);

    let computedRating: number | undefined = feedback.rating;
    if (parsed.type === 'multi_factor' && parsed.factorRatings?.length) {
      const sum = parsed.factorRatings.reduce((acc, r) => acc + r.score, 0);
      computedRating = Math.round((sum / parsed.factorRatings.length) * 10) / 10;
    } else if (parsed.type === 'testimonial' && (parsed as any).rating) {
      computedRating = (parsed as any).rating;
    }

    feedback.factorRatings = (parsed.factorRatings as any) ?? feedback.factorRatings;
    feedback.content = parsed.content ?? feedback.content;
    feedback.rating = computedRating;
    await feedback.save();

    res.status(200).json({ success: true, message: 'Feedback updated successfully', feedback });
  });

  // ── Public testimonials ───────────────────────────────────────────────────
  getPublicTestimonials = asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;

    const rawTestimonials = await FeedbackModel.find({
      status: 'approved',
      type: { $in: ['testimonial', 'multi_factor'] },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('authorId', 'avatar');

    const testimonials = rawTestimonials.map(t => {
      const tObj = t.toObject();
      return {
        ...tObj,
        authorAvatar: (tObj.authorId as any)?.avatar || null,
        authorId: undefined,
        authorModel: undefined
      };
    });


    res.status(200).json({ success: true, testimonials, count: testimonials.length });
  });

  // ── All feedbacks (Admin) ─────────────────────────────────────────────────
  getAdminFeedbacks = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',').filter(Boolean);
      if (statuses.length > 0) query.status = { $in: statuses };
    }
    if (req.query.type) {
      const types = (req.query.type as string).split(',').filter(Boolean);
      if (types.length > 0) query.type = { $in: types };
    }
    if (req.query.portal) query.portal = req.query.portal;

    const feedbacks = await FeedbackModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await FeedbackModel.countDocuments(query);

    res.status(200).json({
      success: true,
      feedbacks,
      pagination: { total, page, pages: Math.ceil(total / limit), limit },
    });
  });

  // ── Update status (Admin) ─────────────────────────────────────────────────
  updateFeedbackStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = updateStatusSchema.parse(req.body);

    const feedback = await FeedbackModel.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found' });

    res.status(200).json({ success: true, message: `Feedback status updated to ${status}`, feedback });
  });

  // ── Delete (Admin) ────────────────────────────────────────────────────────
  deleteFeedback = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const feedback = await FeedbackModel.findByIdAndDelete(id);
    if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found' });
    res.status(200).json({ success: true, message: 'Feedback deleted successfully' });
  });
}
