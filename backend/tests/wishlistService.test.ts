import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Category, Product, User } from '../src/models';
import { wishlistService } from '../src/services/wishlistService';

describe('wishlistService', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  async function seedFixture() {
    const user = await User.create({
      name: 'Wishlist Shopper',
      email: 'wishlist@uconext.test',
      password: 'hashed_password_placeholder',
      role: 'customer',
    });
    const category = await Category.create({ name: 'Audio', slug: 'audio-wl' });
    const productA = await Product.create({
      name: 'Noise Cancelling Earbuds',
      slug: 'noise-cancelling-earbuds',
      price: 1200000,
      stock: 15,
      categoryId: category._id as any,
    });
    const productB = await Product.create({
      name: 'Deleted Speaker',
      slug: 'deleted-speaker',
      price: 900000,
      stock: 4,
      isDeleted: true,
      categoryId: category._id as any,
    });
    return { user, productA, productB };
  }

  it('throws proper Error instances with statusCode on invalid IDs or missing records', async () => {
    const { user, productA, productB } = await seedFixture();
    const missingId = new Types.ObjectId().toString();

    await expect(wishlistService.getWishlist(missingId)).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 404
    );

    await expect(wishlistService.toggleWishlist(user._id.toString(), 'not-an-id')).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 400
    );

    await expect(wishlistService.toggleWishlist(user._id.toString(), missingId)).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 404
    );

    await expect(
      wishlistService.toggleWishlist(user._id.toString(), productB._id.toString())
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 404
    );

    await expect(
      wishlistService.toggleWishlist(missingId, productA._id.toString())
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 404
    );

    await expect(wishlistService.removeFromWishlist(user._id.toString(), 'bad-id')).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 400
    );
  });

  it('toggles wishlist items on/off, removes items, and filters soft-deleted products', async () => {
    const { user, productA } = await seedFixture();
    const userId = user._id.toString();
    const productId = productA._id.toString();

    const added = await wishlistService.toggleWishlist(userId, productId);
    expect(added.wishlisted).toBe(true);
    expect(added.wishlist).toHaveLength(1);
    expect(String((added.wishlist[0] as any)._id)).toBe(productId);

    const toggledOff = await wishlistService.toggleWishlist(userId, productId);
    expect(toggledOff.wishlisted).toBe(false);
    expect(toggledOff.wishlist).toHaveLength(0);

    await wishlistService.toggleWishlist(userId, productId);
    const removed = await wishlistService.removeFromWishlist(userId, productId);
    expect(removed.wishlisted).toBe(false);
    expect(removed.wishlist).toHaveLength(0);

    // Re-add then soft-delete product -> getWishlist filters it out
    await wishlistService.toggleWishlist(userId, productId);
    await Product.findByIdAndUpdate(productId, { isDeleted: true });
    const afterDelete = await wishlistService.getWishlist(userId);
    expect(afterDelete).toHaveLength(0);
  });
});
