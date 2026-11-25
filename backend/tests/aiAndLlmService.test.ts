import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { AIChatSession, User } from '../src/models';
import { resolveLLMConfig, LLMError } from '../src/services/llmClient';
import { aiService, evaluateCouponsForCart, parseStrictJsonObject } from '../src/services/aiService';

describe('llmClient & aiService helpers and session persistence', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('auto-detects LLM providers, normalizes Ollama /v1 URLs, and throws when unconfigured', () => {
    expect(() => resolveLLMConfig({})).toThrow(LLMError);

    const geminiCfg = resolveLLMConfig({
      GEMINI_API_KEY: 'test-gemini-key',
      AI_FALLBACK_MODELS: 'gemini-2.5-flash, gemini-2.5-pro',
      AI_TIMEOUT_MS: '120000', // clamped to 60000
    });
    expect(geminiCfg.provider).toBe('gemini');
    expect(geminiCfg.protocol).toBe('gemini');
    expect(geminiCfg.fallbackModels).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
    expect(geminiCfg.timeoutMs).toBe(60000);

    const ollamaCfg = resolveLLMConfig({
      AI_PROVIDER: 'ollama',
      OLLAMA_BASE_URL: 'http://localhost:11434/',
      OLLAMA_MODEL: 'llama3.2',
    });
    expect(ollamaCfg.provider).toBe('ollama');
    expect(ollamaCfg.protocol).toBe('openai');
    expect(ollamaCfg.baseUrl).toBe('http://localhost:11434/v1');
  });

  it('parses fenced JSON objects and evaluates best & next-tier cart coupons accurately', () => {
    const parsed = parseStrictJsonObject<{ sentimentScore: number }>(
      '```json\n{"sentimentScore": 92}\n```'
    );
    expect(parsed.sentimentScore).toBe(92);

    const now = Date.now();
    const coupons = [
      {
        code: 'WELCOME50K',
        discountType: 'fixed',
        discountValue: 50000,
        minOrderAmount: 300000,
        startDate: new Date(now - 86400000),
        endDate: new Date(now + 86400000),
        usageLimit: 100,
        usedCount: 2,
        isDeleted: false,
      },
      {
        code: 'VIP200K',
        discountType: 'fixed',
        discountValue: 200000,
        minOrderAmount: 1500000,
        startDate: new Date(now - 86400000),
        endDate: new Date(now + 86400000),
        usageLimit: 50,
        usedCount: 0,
        isDeleted: false,
      },
      {
        code: 'PAUSED99',
        discountType: 'fixed',
        discountValue: 99000,
        minOrderAmount: 100000,
        startDate: new Date(now - 86400000),
        endDate: new Date(now + 86400000),
        usageLimit: 50,
        usedCount: 0,
        isActive: false,
        isDeleted: false,
      },
    ];

    const evalAt600k = evaluateCouponsForCart(coupons, 600000);
    expect(evalAt600k.bestCoupon?.code).toBe('WELCOME50K');
    expect(evalAt600k.bestCoupon?.estimatedSavings).toBe(50000);
    expect(evalAt600k.nextTierCoupon?.code).toBe('VIP200K');
    expect(evalAt600k.nextTierCoupon?.amountNeeded).toBe(900000);
  });

  it('retrieves and clears per-user AIChatSession history cleanly', async () => {
    const alice = await User.create({
      name: 'Alice',
      email: 'alice.ai@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const bob = await User.create({
      name: 'Bob',
      email: 'bob.ai@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });

    await AIChatSession.create({
      userId: alice._id as any,
      messages: [
        { role: 'user', text: 'Gợi ý tai nghe dưới 2 triệu', createdAt: new Date() },
        { role: 'assistant', text: 'Dưới đây là 3 mẫu tai nghe phù hợp.', createdAt: new Date() },
      ],
    } as any);

    const aliceHistory = await aiService.getHistory(String(alice._id));
    expect(aliceHistory.messages).toHaveLength(2);

    const bobHistory = await aiService.getHistory(String(bob._id));
    expect(bobHistory.messages).toHaveLength(0);

    await aiService.clearHistory(String(alice._id));
    const afterClear = await aiService.getHistory(String(alice._id));
    expect(afterClear.messages).toHaveLength(0);
  });
});
