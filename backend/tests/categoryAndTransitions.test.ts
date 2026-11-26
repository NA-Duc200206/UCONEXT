import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Product } from '../src/models';
import { categoryService } from '../src/services/categoryService';
import { assertTransition, isRestockedStatus, isValidOrderStatus } from '../src/services/orderTransitions';

describe('categoryService CRUD & orderTransitions state machine', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('validates, creates, updates, caches, and guards deletion of categories', async () => {
    await expect(categoryService.create('   ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(categoryService.create('!!!')).rejects.toMatchObject({ statusCode: 400 });

    const cat1 = await categoryService.create('Smart Audio', 'Hi-Fi speakers');
    expect(cat1.slug).toBe('smart-audio');

    await expect(categoryService.create('Smart Audio')).rejects.toMatchObject({ statusCode: 400 });

    const cat2 = await categoryService.create('Desk Gear', 'Ergonomic accessories');

    // getAll populates cache, second call serves cache
    const firstList = await categoryService.getAll();
    const secondList = await categoryService.getAll();
    expect(firstList).toHaveLength(2);
    expect(secondList).toHaveLength(2);

    // Update validations & conflicts
    await expect(categoryService.update('bad-id', 'X')).rejects.toMatchObject({ statusCode: 404 });
    await expect(categoryService.update(new Types.ObjectId().toString(), 'X')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(categoryService.update(String(cat1.id), '   ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(categoryService.update(String(cat1.id), '@@@')).rejects.toMatchObject({ statusCode: 400 });
    await expect(categoryService.update(String(cat1.id), 'Desk Gear')).rejects.toMatchObject({
      statusCode: 400,
    });

    const renamed = await categoryService.update(String(cat1.id), 'Studio Audio', 'Updated desc');
    expect(renamed.name).toBe('Studio Audio');
    expect(renamed.slug).toBe('studio-audio');

    // Guard deletion when active products exist
    await Product.create({
      name: 'Studio Monitor',
      slug: 'studio-monitor-cat-test',
      price: 1500000,
      stock: 5,
      categoryId: cat1.id as any,
    });
    await expect(categoryService.delete(String(cat1.id))).rejects.toMatchObject({ statusCode: 400 });
    await expect(categoryService.delete('bad-id')).rejects.toMatchObject({ statusCode: 404 });
    await expect(categoryService.delete(new Types.ObjectId().toString())).rejects.toMatchObject({
      statusCode: 404,
    });

    // Empty category deletes cleanly
    expect(await categoryService.delete(String(cat2.id))).toBe(true);
  });

  it('enforces orderTransitions helpers and rejects unknown or illegal state jumps', () => {
    expect(isValidOrderStatus('pending')).toBe(true);
    expect(isValidOrderStatus('unknown_state')).toBe(false);
    expect(isRestockedStatus('cancelled')).toBe(true);
    expect(isRestockedStatus('refund_completed')).toBe(true);
    expect(isRestockedStatus('delivered')).toBe(false);

    // Same non-terminal status is allowed as idempotent no-op
    expect(() => assertTransition('pending', 'pending')).not.toThrow();
    expect(() => assertTransition('pending', 'confirmed')).not.toThrow();

    // Unknown status throws 400 INVALID_TRANSITION
    expect(() => assertTransition('pending', 'teleported')).toThrow(/Unknown order status/);

    // Terminal state cannot transition to anything (even itself)
    expect(() => assertTransition('cancelled', 'confirmed')).toThrow(/Cannot transition order/);
    expect(() => assertTransition('refund_completed', 'refund_completed')).toThrow(/Cannot transition order/);
  });
});
