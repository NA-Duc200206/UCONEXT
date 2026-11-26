import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Category, Product, User } from '../src/models';
import { reviewService } from '../src/services/reviewService';

describe('reviewService validation, upsert, and authorization', () => {
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
    const author = await User.create({
      name: 'Reviewer One',
      email: 'reviewer1@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const otherUser = await User.create({
      name: 'Other User',
      email: 'other@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin.rev@uconext.test',
      password: 'hashed_password',
      role: 'admin',
    });
    const category = await Category.create({ name: 'Keyboards', slug: 'keyboards-rev' });
    const product = await Product.create({
      name: 'Mechanical Keyboard',
      slug: 'mechanical-keyboard',
      price: 1800000,
      stock: 10,
      categoryId: category._id as any,
    });
    return { author, otherUser, admin, product };
  }

  it('rejects invalid product IDs, out-of-range ratings, and empty or oversized comments', async () => {
    const { author, product } = await seedFixture();
    const uid = author._id.toString();
    const pid = product._id.toString();

    await expect(reviewService.getProductReviews('bad-id')).rejects.toMatchObject({ statusCode: 404 });
    await expect(reviewService.addReview(uid, 'bad-id', 5, 'Nice')).rejects.toMatchObject({ statusCode: 404 });
    await expect(reviewService.addReview(uid, pid, 0, 'Too low')).rejects.toMatchObject({ statusCode: 400 });
    await expect(reviewService.addReview(uid, pid, 6, 'Too high')).rejects.toMatchObject({ statusCode: 400 });
    await expect(reviewService.addReview(uid, pid, 3.5, 'Half star')).rejects.toMatchObject({ statusCode: 400 });
    await expect(reviewService.addReview(uid, pid, 5, '   ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(reviewService.addReview(uid, pid, 5, 'a'.repeat(2001))).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      reviewService.addReview(uid, new Types.ObjectId().toString(), 5, 'Ghost product')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('upserts existing review, enforces delete ownership vs admin override, and revives deleted reviews', async () => {
    const { author, otherUser, admin, product } = await seedFixture();
    const authorId = author._id.toString();
    const otherId = otherUser._id.toString();
    const adminId = admin._id.toString();
    const pid = product._id.toString();

    const created = await reviewService.addReview(authorId, pid, 4, 'Solid switches');
    expect(created.rating).toBe(4);

    // Same user updating review upserts in place
    const updated = await reviewService.addReview(authorId, pid, 5, 'Even better after lube');
    expect(String(updated._id)).toBe(String(created._id));
    expect(updated.rating).toBe(5);

    // Invalid or nonexistent review delete -> 404
    await expect(reviewService.deleteReview('invalid-id', authorId, false)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      reviewService.deleteReview(new Types.ObjectId().toString(), authorId, false)
    ).rejects.toMatchObject({ statusCode: 404 });

    // Unrelated customer cannot delete -> 403
    await expect(reviewService.deleteReview(String(created._id), otherId, false)).rejects.toMatchObject({
      statusCode: 403,
    });

    // Author deletes own review
    expect(await reviewService.deleteReview(String(created._id), authorId, false)).toBe(true);
    let list = await reviewService.getProductReviews(pid);
    expect(list.totalReviews).toBe(0);

    // Re-submitting revives the soft-deleted review; admin can delete any review
    const revived = await reviewService.addReview(authorId, pid, 5, 'Back again');
    expect(String(revived._id)).toBe(String(created._id));
    expect(await reviewService.deleteReview(String(revived._id), adminId, true)).toBe(true);
    list = await reviewService.getProductReviews(pid);
    expect(list.totalReviews).toBe(0);
  });
});
