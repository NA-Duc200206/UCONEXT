import { Response } from 'express';
import { wishlistService } from '../services/wishlistService';

export const wishlistController = {
  async getWishlist(req: any, res: Response) {
    try {
      const wishlist = await wishlistService.getWishlist(req.user._id);
      return res.status(200).json({ wishlist });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to retrieve wishlist.',
        error: error.message
      });
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
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to update wishlist.',
        error: error.message
      });
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
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to remove from wishlist.',
        error: error.message
      });
    }
  }
};

