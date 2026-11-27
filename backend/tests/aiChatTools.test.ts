import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { AIChatSession, Category, Coupon, Order, Product, Review, User } from '../src/models';
import {
  aiService,
  invalidateProductInsightsCache,
  resetInMemoryAiBudget,
} from '../src/services/aiService';

function oaiReply(content: string | null, toolCalls?: Array<{ id: string; name: string; args: any }>) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content,
            ...(toolCalls
              ? {
                  tool_calls: toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: JSON.stringify(tc.args) },
                  })),
                }
              : {}),
          },
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('aiService tool-calling loop, session persistence, and product insights', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
    resetInMemoryAiBudget();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  async function seedCatalogAndUser() {
    const user = await User.create({
      name: 'Concierge Buyer',
      email: 'concierge@uconext.test',
      password: 'hashed_password',
      role: 'customer',
      cart: [{ productId: new Types.ObjectId() as any, name: 'Tmp', price: 800000, quantity: 1 }],
    });
    const audio = await Category.create({ name: 'Audio', slug: 'audio-ai' });
    const p1 = await Product.create({
      name: 'Studio Wireless Headphones',
      slug: 'studio-wireless-headphones',
      description: 'Active noise cancelling headphones',
      price: 1200000,
      stock: 15,
      options: { colors: ['Black'], sizes: [] },
      categoryId: audio._id as any,
    });
    const p2 = await Product.create({
      name: 'Compact Studio Earbuds',
      slug: 'compact-studio-earbuds',
      description: 'Lightweight studio earbuds',
      price: 650000,
      stock: 8,
      options: { colors: ['White'], sizes: [] },
      categoryId: audio._id as any,
    });
    await Review.create({
      productId: p1._id as any,
      userId: user._id as any,
      rating: 5,
      comment: 'Amazing noise isolation.',
    });
    await Coupon.create({
      code: 'AUDIO10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 500000,
      maxDiscountAmount: 150000,
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
      usageLimit: 100,
      isActive: true,
    });
    await Order.create({
      userId: user._id as any,
      items: [{ productId: p1._id as any, name: p1.name, price: p1.price, quantity: 1 }],
      totalAmount: 1200000,
      shippingAddress: '10 Le Loi, HCMC',
      status: 'confirmed',
      paymentMethod: 'cod',
      paymentStatus: 'pending',
    });
    return { user, audio, p1, p2 };
  }

  it('executes all chat tools end-to-end and persists user chat session', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-ai-tools-123456');

    const { user, p1, p2 } = await seedCatalogAndUser();

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Round 1: invoke catalog, comparison, coupons, recommendations, orders, and unknown tool
    fetchSpy.mockResolvedValueOnce(
      oaiReply(null, [
        { id: 'c1', name: 'list_categories', args: {} },
        {
          id: 'c2',
          name: 'search_products',
          args: { query: 'Studio', categoryName: 'Audio', minPrice: 500000, maxPrice: 2000000, sort: 'price_asc' },
        },
        { id: 'c3', name: 'get_product_details', args: { productId: p1._id.toString() } },
        {
          id: 'c4',
          name: 'compare_products',
          args: { productIds: [p1._id.toString(), p2._id.toString()], verdict: 'Earbuds save budget.' },
        },
        { id: 'c5', name: 'get_recommended_products', args: { limit: 2, maxPrice: 1500000 } },
        { id: 'c6', name: 'get_active_coupons', args: {} },
        { id: 'c7', name: 'get_my_orders', args: { limit: 2 } },
        { id: 'c8', name: 'nonexistent_tool', args: {} },
      ])
    );
    // Round 2: final assistant answer
    fetchSpy.mockResolvedValueOnce(
      oaiReply('Both audio picks are in stock, and AUDIO10 saves 10% on your cart.')
    );

    const reply = await aiService.chat('Compare audio gear and check my coupons and orders', user, {
      context: { page: '/shop', productId: p1._id.toString(), cartTotal: 1000000, cartCount: 1 },
    });

    expect(reply.message).toContain('AUDIO10');
    expect(reply.toolsUsed).toEqual(
      expect.arrayContaining([
        'list_categories',
        'search_products',
        'get_product_details',
        'compare_products',
        'get_recommended_products',
        'get_active_coupons',
        'get_my_orders',
      ])
    );
    expect(reply.products.length).toBeGreaterThanOrEqual(2);
    expect(reply.coupons[0]?.code).toBe('AUDIO10');
    expect(reply.orders).toHaveLength(1);
    expect(reply.comparison?.verdict).toBe('Earbuds save budget.');

    const savedSession = await AIChatSession.findOne({ userId: user._id as any }).lean();
    expect(savedSession?.messages).toHaveLength(2);
    expect(savedSession?.lastProductIds?.length).toBeGreaterThanOrEqual(2);
  });

  it('handles guest order tool response, empty LLM response, and daily budget exhaustion', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-ai-tools-123456');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Guest calling get_my_orders + search_products category miss + invalid productId
    fetchSpy.mockResolvedValueOnce(
      oaiReply(null, [
        { id: 'g1', name: 'get_my_orders', args: {} },
        { id: 'g2', name: 'search_products', args: { categoryName: 'DoesNotExist' } },
        { id: 'g3', name: 'get_product_details', args: { productId: 'invalid-id' } },
        { id: 'g4', name: 'compare_products', args: { productIds: ['only-one'] } },
      ])
    );
    fetchSpy.mockResolvedValueOnce(oaiReply('Please sign in to view your orders.'));

    const guestRes = await aiService.chat('Where is my order?');
    expect(guestRes.message).toContain('sign in');

    // Empty synthesis response -> AI_EMPTY_RESPONSE
    fetchSpy.mockResolvedValueOnce(oaiReply('   '));
    fetchSpy.mockResolvedValueOnce(oaiReply('   '));
    await expect(aiService.chat('Hello')).rejects.toMatchObject({ code: 'AI_EMPTY_RESPONSE', statusCode: 502 });

    // Budget exceeded -> AI_BUDGET_EXCEEDED
    vi.stubEnv('AI_DAILY_TOKEN_BUDGET', '1');
    resetInMemoryAiBudget();
    fetchSpy.mockResolvedValueOnce(oaiReply('First call'));
    await aiService.chat('First');
    await expect(aiService.chat('Second')).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
      statusCode: 503,
    });
  });

  it('generates, caches, invalidates, and validates JSON for getProductInsights', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-insights-123456');

    const { p1 } = await seedCatalogAndUser();
    const pid = p1._id.toString();

    await expect(aiService.getProductInsights('bad-id')).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      aiService.getProductInsights(new Types.ObjectId().toString())
    ).rejects.toMatchObject({ statusCode: 404 });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const validInsights = {
      headline: 'Strong ANC value at 1,200,000 VND',
      pros: ['5/5 verified rating for noise isolation', '15 units ready to ship'],
      cons: ['Limited to Black colorway'],
      bestFor: 'Commuters and desk workers wanting quiet focus.',
      verdict: 'Recommended buy for the price tier.',
      suggestedQuestions: ['Any coupons available?', 'Compare with earbuds', 'Is shipping free?'],
    };

    fetchSpy.mockResolvedValueOnce(oaiReply(JSON.stringify(validInsights)));

    const first = await aiService.getProductInsights(pid);
    expect(first.headline).toBe(validInsights.headline);
    expect(first.reviewCount).toBe(1);
    expect(first.averageRating).toBe(5);

    // Second call hits in-memory cache without calling fetch again
    const cached = await aiService.getProductInsights(pid);
    expect(cached.headline).toBe(validInsights.headline);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // After invalidation, invalid JSON from LLM throws AI_INVALID_RESPONSE
    await invalidateProductInsightsCache(pid);
    fetchSpy.mockResolvedValueOnce(oaiReply('not json at all'));
    await expect(aiService.getProductInsights(pid)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      statusCode: 502,
    });

    // Incomplete JSON throws AI_INVALID_RESPONSE
    fetchSpy.mockResolvedValueOnce(oaiReply(JSON.stringify({ headline: 'Only headline' })));
    await expect(aiService.getProductInsights(pid)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      statusCode: 502,
    });
  });
});
