import { Types } from 'mongoose';
import { Review } from '../models/Review';
import { Product } from '../models/Product';
import { Order } from '../models/Order';
import { cacheService } from '../utils/cache';
import { invalidateProductInsightsCache } from './aiService';

const MAX_REVIEW_COMMENT_LENGTH = 2000;

function createReviewError(message: string, statusCode = 400) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export const reviewService = {
  async getProductReviews(productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw createReviewError('Product not found.', 404);
    }

    const reviews: any[] = await Review.find({ productId: productId as any, isDeleted: false })
      .populate('userId', 'name avatar')
      .sort({ createdAt: -1 });

    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? Number((reviews.reduce((acc, r: any) => acc + (r.rating || 5), 0) / totalReviews).toFixed(1))
        : 0;

    const authorIds = Array.from(
      new Set(
        reviews
          .map((r: any) => (r.userId && r.userId._id ? String(r.userId._id) : String(r.userId || '')))
          .filter((id) => Types.ObjectId.isValid(id))
      )
    );

    const verifiedOrders =
      authorIds.length > 0
        ? await Order.find({
            userId: { $in: authorIds.map((id) => new Types.ObjectId(id)) as any },
            status: { $in: ['delivered', 'completed'] },
            'items.productId': new Types.ObjectId(productId) as any,
          })
            .select('userId')
            .lean()
        : [];

    const verifiedBuyerSet = new Set(verifiedOrders.map((o: any) => String(o.userId)));

    return {
      totalReviews,
      averageRating,
      reviews: reviews.map((r: any) => {
        const obj = typeof r.toObject === 'function' ? r.toObject() : r;
        const rawAuthorId = obj.userId && obj.userId._id ? String(obj.userId._id) : String(obj.userId || '');
        return {
          ...obj,
          id: obj._id,
          user: obj.userId,
          verifiedPurchase: verifiedBuyerSet.has(rawAuthorId),
        };
      }),
    };
  },

  async addReview(userId: string, productId: string, rating: number, comment: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw createReviewError('Product not found.', 404);
    }

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      throw createReviewError('Rating must be an integer between 1 and 5 stars.', 400);
    }

    const cleanComment = typeof comment === 'string' ? comment.trim() : '';
    if (!cleanComment) {
      throw createReviewError('Review comment cannot be empty.', 400);
    }
    if (cleanComment.length > MAX_REVIEW_COMMENT_LENGTH) {
      throw createReviewError(`Review comment cannot exceed ${MAX_REVIEW_COMMENT_LENGTH} characters.`, 400);
    }

    const product = await Product.findById(productId);
    if (!product || product.isDeleted) {
      throw createReviewError('Product not found.', 404);
    }

    const existing: any = await Review.findOne({ productId: productId as any, userId: userId as any });
    if (existing) {
      existing.rating = numericRating;
      existing.comment = cleanComment;
      existing.isDeleted = false;
      await existing.save();
      await cacheService.invalidateByPrefix('cache:products:');
      await invalidateProductInsightsCache(productId);
      return existing;
    }

    const review = await Review.create({
      productId: productId as any,
      userId: userId as any,
      rating: numericRating,
      comment: cleanComment,
    } as any);

    await cacheService.invalidateByPrefix('cache:products:');
    await invalidateProductInsightsCache(productId);
    return review;
  },

  async deleteReview(reviewId: string, userId: string, isAdmin: boolean) {
    if (!Types.ObjectId.isValid(reviewId)) {
      throw createReviewError('Review not found.', 404);
    }

    const review: any = await Review.findById(reviewId);
    if (!review) {
      throw createReviewError('Review not found.', 404);
    }

    if (review.userId.toString() !== userId.toString() && !isAdmin) {
      throw createReviewError('Not authorized to delete this review.', 403);
    }

    review.isDeleted = true;
    await review.save();
    await cacheService.invalidateByPrefix('cache:products:');
    await invalidateProductInsightsCache(String(review.productId));
    return true;
  },
};
