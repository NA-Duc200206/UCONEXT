import { Response } from 'express';
import { wishlistService } from '../services/wishlistService';
import { sendSafeError } from '../middleware/errorHandler';

export const wishlistController = {
  async getWishlist(req: any, res: Response) {
    try {
      const wishlist = await wishlistService.getWishlist(req.user._id);
      return res.status(200).json({ wishlist });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async toggleWishlist(req: any, res: Response) {
    try {
      const productId = (req.params.productId || req.body?.productId) as string;
      const result = await wishlistService.toggleWishlist(req.user._id, productId);
      return res.status(200).json({
        message: result.wishlisted ? 'Added to wishlist.' : 'Removed from wishlist.',
        ...result
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async removeFromWishlist(req: any, res: Response) {
    try {
      const { productId } = req.params;
      const result = await wishlistService.removeFromWishlist(req.user._id, productId as string);
      return res.status(200).json({
        message: 'Removed from wishlist.',
        ...result
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  }
};
