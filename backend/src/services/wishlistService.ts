import mongoose from 'mongoose';
import { User, Product } from '../models';

export const wishlistService = {
  async getWishlist(userId: string) {
    const user = await User.findById(userId).populate({
      path: 'wishlist',
      match: { isDeleted: { $ne: true } },
      populate: { path: 'categoryId', select: 'name slug' }
    });

    if (!user) {
      throw { statusCode: 404, message: 'User not found.' };
    }

    return (user.wishlist || []).filter(Boolean);
  },

  async toggleWishlist(userId: string, productId: string) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw { statusCode: 400, message: 'Invalid product ID.' };
    }

    const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } });
    if (!product) {
      throw { statusCode: 404, message: 'Product not found.' };
    }

    const user = await User.findById(userId).select('wishlist');
    if (!user) {
      throw { statusCode: 404, message: 'User not found.' };
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
      wishlist
    };
  },

  async removeFromWishlist(userId: string, productId: string) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw { statusCode: 400, message: 'Invalid product ID.' };
    }

    await User.findByIdAndUpdate(userId, { $pull: { wishlist: productId } });
    const wishlist = await this.getWishlist(userId);
    return {
      wishlisted: false,
      wishlist
    };
  }
};
