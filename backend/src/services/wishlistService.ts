import mongoose from 'mongoose';
import { User, Product } from '../models';

function createWishlistError(message: string, statusCode: number): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export const wishlistService = {
  async getWishlist(userId: string) {
    const user = await User.findById(userId).populate({
      path: 'wishlist',
      match: { isDeleted: { $ne: true } },
      populate: { path: 'categoryId', select: 'name slug' },
    });

    if (!user) {
      throw createWishlistError('User not found.', 404);
    }

    return (user.wishlist || []).filter(Boolean);
  },

  async toggleWishlist(userId: string, productId: string) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw createWishlistError('Invalid product ID.', 400);
    }

    const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } });
    if (!product) {
      throw createWishlistError('Product not found.', 404);
    }

    const user = await User.findById(userId).select('wishlist');
    if (!user) {
      throw createWishlistError('User not found.', 404);
    }

    const exists = (user.wishlist || []).some((id) => String(id) === String(productId));

    if (exists) {
      await User.findByIdAndUpdate(userId, { $pull: { wishlist: productId } });
    } else {
      await User.findByIdAndUpdate(userId, { $addToSet: { wishlist: productId } });
    }

    const wishlist = await this.getWishlist(userId);
    return {
      wishlisted: !exists,
      wishlist,
    };
  },

  async removeFromWishlist(userId: string, productId: string) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw createWishlistError('Invalid product ID.', 400);
    }

    await User.findByIdAndUpdate(userId, { $pull: { wishlist: productId } });
    const wishlist = await this.getWishlist(userId);
    return {
      wishlisted: false,
      wishlist,
    };
  },
};
