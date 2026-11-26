import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  callLLM,
  getLLMStatus,
  LLMError,
  redactSecretTokens,
  resolveLLMConfig,
} from '../src/services/llmClient';

function mockJsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('llmClient configuration, protocol adapters, error mapping, and fallback retry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('resolves all supported providers, validates missing keys/unsupported providers, and reports status', () => {
    expect(getLLMStatus({}).configured).toBe(false);

    expect(resolveLLMConfig({ OPENAI_API_KEY: 'sk-test1234567890' })).toMatchObject({
      provider: 'openai',
      protocol: 'openai',
    });
    expect(resolveLLMConfig({ GROQ_API_KEY: 'gsk_test1234567890' })).toMatchObject({
      provider: 'groq',
      protocol: 'openai',
    });
    expect(resolveLLMConfig({ OPENROUTER_API_KEY: 'sk-or-test123456' })).toMatchObject({
      provider: 'openrouter',
      protocol: 'openai',
    });
    expect(resolveLLMConfig({ DEEPSEEK_API_KEY: 'sk-ds1234567890' })).toMatchObject({
      provider: 'deepseek',
      protocol: 'openai',
    });
    expect(
      resolveLLMConfig({ AI_API_KEY: 'generic-key', AI_BASE_URL: 'https://llm.local/v1/' })
    ).toMatchObject({
      provider: 'openai-compatible',
      baseUrl: 'https://llm.local/v1',
    });
    expect(
      resolveLLMConfig({ GEMINI_API_KEY: 'AIza1234567890abcd', GEMINI_THINKING_LEVEL: 'OFF' })
    ).toMatchObject({
      provider: 'gemini',
      thinkingLevel: undefined,
    });
    expect(
      resolveLLMConfig({ GEMINI_API_KEY: 'AIza1234567890abcd', GEMINI_THINKING_LEVEL: 'HIGH' })
    ).toMatchObject({
      thinkingLevel: 'HIGH',
    });

    expect(getLLMStatus({ OPENAI_API_KEY: 'sk-test1234567890' })).toMatchObject({
      configured: true,
      provider: 'openai',
    });

    expect(() => resolveLLMConfig({ AI_PROVIDER: 'unknown-vendor' })).toThrow(LLMError);
    expect(() => resolveLLMConfig({ AI_PROVIDER: 'openai' })).toThrow(LLMError);

    expect(
      redactSecretTokens('keys AIzaSy1234567890 sk-or-v1-abcdef1234 sk-proj1234567890 gsk_abcdefghijkl')
    ).toBe('keys [REDACTED] [REDACTED] [REDACTED] [REDACTED]');
  });

  it('calls Gemini protocol with tools, rawParts, thinkingConfig, and maps HTTP/timeout errors', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        candidates: [
          {
            content: {
              parts: [
                { text: 'internal thought', thought: true },
                { text: 'Checking products now.' },
                { functionCall: { name: 'search_products', args: { query: 'mouse' } } },
              ],
            },
          },
        ],
      })
    );

    const env = {
      GEMINI_API_KEY: 'AIzaTestSecretKey123456',
      GEMINI_MODEL: 'gemini-3.1-flash-lite',
    };

    const res = await callLLM(
      {
        systemPrompt: 'You are a store assistant.',
        messages: [
          { role: 'user', content: 'Find a mouse' },
          {
            role: 'assistant',
            content: 'Searching',
            toolCalls: [{ id: 'tc1', name: 'list_categories', args: {} }],
          },
          { role: 'tool', toolCallId: 'tc1', name: 'list_categories', result: { categories: [] } },
        ],
        tools: [
          {
            name: 'search_products',
            description: 'Search products',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
        ],
      },
      env
    );

    expect(res.text).toBe('Checking products now.');
    expect(res.toolCalls).toEqual([
      { id: 'gemini_fc_2', name: 'search_products', args: { query: 'mouse' } },
    ]);
    const sentInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const sentBody = JSON.parse(String(sentInit.body));
    expect(sentBody.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
    expect((sentInit.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'AIzaTestSecretKey123456'
    );

    // 401 -> AI_AUTH_ERROR with secret redacted
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ error: { message: 'Invalid key AIzaTestSecretKey123456' } }, 401)
    );
    await expect(
      callLLM({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }] }, env)
    ).rejects.toMatchObject({ code: 'AI_AUTH_ERROR', statusCode: 502 });

    // 429 -> AI_RATE_LIMITED
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ message: 'quota' }, 429));
    await expect(
      callLLM({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }] }, env)
    ).rejects.toMatchObject({ code: 'AI_RATE_LIMITED', statusCode: 429 });

    // Timeout error -> AI_TIMEOUT (504)
    const timeoutErr = new Error('timed out');
    timeoutErr.name = 'TimeoutError';
    fetchSpy.mockRejectedValueOnce(timeoutErr);
    await expect(
      callLLM({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }] }, env)
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT', statusCode: 504 });
  });

  it('calls OpenAI-compatible protocol (including OpenRouter headers, tool calls, and fallback model retry)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // First model returns 503 (AI_OVERLOADED), fallback model succeeds with tool_calls
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: { message: 'overloaded' } }, 503));
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [
          {
            message: {
              content: 'Here are the details.',
              tool_calls: [
                {
                  id: 'call_1',
                  function: { name: 'get_active_coupons', arguments: '{"cartTotal":500000}' },
                },
                {
                  id: 'call_2',
                  function: { name: 'list_categories', arguments: 'not-valid-json' },
                },
              ],
            },
          },
        ],
      })
    );

    const env = {
      AI_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'sk-or-test-key-123456',
      OPENROUTER_MODEL: 'primary-model',
      AI_FALLBACK_MODELS: 'fallback-model',
    };

    const res = await callLLM(
      {
        systemPrompt: 'System',
        messages: [
          { role: 'user', content: 'Coupons?' },
          { role: 'assistant', content: 'Checking', toolCalls: [{ id: 't0', name: 'x', args: {} }] },
          { role: 'tool', toolCallId: 't0', name: 'x', result: { ok: true } },
        ],
        jsonMode: true,
      },
      env
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res.model).toBe('fallback-model');
    expect(res.toolCalls).toEqual([
      { id: 'call_1', name: 'get_active_coupons', args: { cartTotal: 500000 } },
      { id: 'call_2', name: 'list_categories', args: {} },
    ]);

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Title']).toBe('UCONEXT');
    expect(headers.Authorization).toBe('Bearer sk-or-test-key-123456');

    // Network failure on OpenAI-compatible protocol -> AI_UPSTREAM_ERROR
    fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(
      callLLM({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }] }, env)
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM_ERROR', statusCode: 502 });
  });
});
