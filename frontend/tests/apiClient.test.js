import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, getAccessToken, setAccessToken, clearAccessToken } from '../src/services/api.js';

function makeJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('frontend API client & in-memory token silent refresh mutex', () => {
  const originalFetch = globalThis.fetch;
  let dispatchedEvents = [];
  let expiredHandler;

  beforeEach(() => {
    dispatchedEvents = [];
    localStorage.clear();
    clearAccessToken();
    expiredHandler = () => dispatchedEvents.push('uconext:auth-expired');
    window.addEventListener('uconext:auth-expired', expiredHandler);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    window.removeEventListener('uconext:auth-expired', expiredHandler);
    clearAccessToken();
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps access token strictly in memory (never localStorage) after login', async () => {
    globalThis.fetch = async (url, options = {}) => {
      if (url === '/api/auth/login') {
        expect(options.credentials).toBe('include');
        return makeJsonResponse(200, {
          token: 'in-memory-jwt',
          user: { id: 'u1', email: 'test@uconext.vn' },
        });
      }
      return makeJsonResponse(200, { ok: true });
    };

    await api.auth.login('test@uconext.vn', 'StrongPass1');

    expect(getAccessToken()).toBe('in-memory-jwt');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('coalesces concurrent 401 responses into a single cookie-backed refresh and retries requests', async () => {
    setAccessToken('expired-access-token');

    let refreshCallCount = 0;
    globalThis.fetch = async (url, options = {}) => {
      expect(options.credentials).toBe('include');
      if (url === '/api/auth/refresh') {
        refreshCallCount += 1;
        expect(options.body).toBeUndefined();
        await new Promise((r) => setTimeout(r, 15));
        return makeJsonResponse(200, {
          token: 'fresh-access-token',
        });
      }

      const authHeader = options.headers?.Authorization || '';
      if (authHeader === 'Bearer expired-access-token') {
        return makeJsonResponse(401, { message: 'Token expired' });
      }
      if (authHeader === 'Bearer fresh-access-token') {
        return makeJsonResponse(200, { endpoint: url, ok: true });
      }
      return makeJsonResponse(401, { message: 'Missing auth' });
    };

    const [r1, r2, r3] = await Promise.all([
      api.orders.getMyOrders(),
      api.wishlist.getAll(),
      api.auth.getProfile(),
    ]);

    expect(refreshCallCount).toBe(1);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(getAccessToken()).toBe('fresh-access-token');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(dispatchedEvents).not.toContain('uconext:auth-expired');
  });

  it('clears in-memory token and dispatches uconext:auth-expired when token refresh fails', async () => {
    setAccessToken('expired-access-token');

    globalThis.fetch = async (url) => {
      if (url === '/api/auth/refresh') {
        return makeJsonResponse(401, { message: 'Refresh token revoked' });
      }
      return makeJsonResponse(401, { message: 'Access token expired' });
    };

    await expect(api.orders.getMyOrders()).rejects.toThrow(/Access token expired/);
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(dispatchedEvents).toContain('uconext:auth-expired');
  });

  it('handles non-JSON 502 gateway HTML error pages gracefully without SyntaxError', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 502,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => '<html><body>502 Bad Gateway</body></html>',
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });

    await expect(api.categories.getAll()).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/Server unavailable \(HTTP 502\)/),
    });
  });
});
