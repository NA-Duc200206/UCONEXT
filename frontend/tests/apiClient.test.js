import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

function makeJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('frontend API client & silent refresh mutex', () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  let dispatchedEvents = [];

  beforeEach(() => {
    dispatchedEvents = [];
    globalThis.localStorage = createMemoryStorage();
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, detail) {
        this.type = type;
        this.detail = detail;
      }
    };
    globalThis.window = {
      dispatchEvent: (evt) => dispatchedEvents.push(evt.type),
    };
    console.error = () => {};
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    delete globalThis.localStorage;
    delete globalThis.window;
  });

  it('coalesces concurrent 401 responses into a single token refresh and retries requests', async () => {
    globalThis.localStorage.setItem('token', 'expired-access-token');
    globalThis.localStorage.setItem('refreshToken', 'valid-refresh-token');

    let refreshCallCount = 0;
    globalThis.fetch = async (url, options = {}) => {
      if (url === '/api/auth/refresh') {
        refreshCallCount += 1;
        await new Promise((r) => setTimeout(r, 15));
        return makeJsonResponse(200, {
          token: 'fresh-access-token',
          refreshToken: 'rotated-refresh-token',
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

    const { api } = await import('../src/services/api.js');

    const [r1, r2, r3] = await Promise.all([
      api.orders.getMyOrders(),
      api.wishlist.getAll(),
      api.auth.getProfile(),
    ]);

    assert.equal(refreshCallCount, 1);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(r3.ok, true);
    assert.equal(globalThis.localStorage.getItem('token'), 'fresh-access-token');
    assert.equal(globalThis.localStorage.getItem('refreshToken'), 'rotated-refresh-token');
    assert.equal(dispatchedEvents.length, 0);
  });

  it('clears storage and dispatches uconext:auth-expired when token refresh fails', async () => {
    globalThis.localStorage.setItem('token', 'expired-access-token');
    globalThis.localStorage.setItem('refreshToken', 'revoked-refresh-token');

    globalThis.fetch = async (url) => {
      if (url === '/api/auth/refresh') {
        return makeJsonResponse(401, { message: 'Refresh token revoked' });
      }
      return makeJsonResponse(401, { message: 'Access token expired' });
    };

    const { api } = await import('../src/services/api.js');

    await assert.rejects(() => api.orders.getMyOrders(), /Access token expired/);
    assert.equal(globalThis.localStorage.getItem('token'), null);
    assert.equal(globalThis.localStorage.getItem('refreshToken'), null);
    assert.equal(dispatchedEvents.includes('uconext:auth-expired'), true);
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

    const { api } = await import('../src/services/api.js');

    await assert.rejects(
      () => api.categories.getAll(),
      (err) => err.status === 502 && /Server unavailable \(HTTP 502\)/.test(err.message)
    );
  });
});
