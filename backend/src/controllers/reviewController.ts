import { Request, Response } from 'express';
import { reviewService } from '../services/reviewService';
import { sendSafeError } from '../middleware/errorHandler';

export const reviewController = {
  async getProductReviews(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const data = await reviewService.getProductReviews(productId as string);
      return res.status(200).json(data);
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async addReview(req: any, res: Response) {
    try {
      const { productId, rating, comment } = req.body;
      const review = await reviewService.addReview(req.user._id, productId, Number(rating), comment);
      return res.status(201).json({ message: 'Review submitted successfully.', review });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async deleteReview(req: any, res: Response) {
    try {
      const { id } = req.params;
      await reviewService.deleteReview(id as string, req.user._id, req.user.role === 'admin');
      return res.status(200).json({ message: 'Review deleted successfully.' });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  }
};
