import http from 'http';
import { AddressInfo } from 'net';
import bcrypt from 'bcryptjs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import app from '../src/server';
import { User } from '../src/models';
import { authService } from '../src/services/authService';
import { emailService } from '../src/services/emailService';
import { configureSocketAuth, setIO } from '../src/config/socket';

function extractCookieValue(setCookieHeader: string | null, name: string): string {
  if (!setCookieHeader) return '';
  const match = new RegExp(`(?:^|,\\s*)${name}=([^;]+)`).exec(setCookieHeader);
  return match ? match[1] : '';
}

describe('Auth hardening, HttpOnly refresh cookies, token versioning & reuse detection', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await clearTestDB();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectTestDB();
  });

  it('returns 404 for removed POST /api/auth/google endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'fake-token' }),
    });
    expect(res.status).toBe(404);
  });

  it('prevents account enumeration on login (identical message + dummy bcrypt) and forgotPassword (async dispatch)', async () => {
    // Create a social-only user without password
    await User.create({
      name: 'Social User',
      email: 'social@uconext.test',
      firebaseUid: 'fb-uid-1',
      authProvider: 'google',
      role: 'customer',
    });

    const compareSpy = vi.spyOn(bcrypt, 'compare');

    await expect(authService.login('nonexistent@uconext.test', 'AnyPass123', '127.0.0.1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Email hoặc mật khẩu không đúng.',
    });
    expect(compareSpy).toHaveBeenCalledTimes(1);

    await expect(authService.login('social@uconext.test', 'AnyPass123', '127.0.0.1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Email hoặc mật khẩu không đúng.',
    });
    expect(compareSpy).toHaveBeenCalledTimes(2);

    // forgotPassword should not await slow SMTP before returning
    await authService.register('Timing User', 'timing@uconext.test', 'StrongPass1', '127.0.0.1');
    let emailStarted = false;
    let resolveSmtp: () => void = () => {};
    vi.spyOn(emailService, 'sendPasswordResetEmail').mockImplementation(
      () =>
        new Promise((resolve) => {
          emailStarted = true;
          resolveSmtp = () => resolve(true as any);
        })
    );

    const ok = await authService.forgotPassword('timing@uconext.test');
    expect(ok).toBe(true);
    // Email has not blocked the call; it fires on setImmediate
    expect(emailStarted).toBe(false);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(emailStarted).toBe(true);
    resolveSmtp();
  });

  it('issues HttpOnly uc_rt cookie, revokes all sessions on refresh token reuse, and invalidates old access tokens', async () => {
    // Register -> gets HttpOnly uc_rt cookie, no refreshToken in JSON body
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Session User',
        email: 'session@uconext.test',
        password: 'StrongPassword1',
      }),
    });
    expect(regRes.status).toBe(201);
    const setCookie = regRes.headers.get('set-cookie') || '';
    expect(setCookie).toContain('uc_rt=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/api/auth');

    const regBody: any = await regRes.json();
    expect(regBody.token).toBeTruthy();
    expect(regBody.refreshToken).toBeUndefined();
    const firstRt = extractCookieValue(setCookie, 'uc_rt');
    expect(firstRt).toBeTruthy();

    // Refresh via cookie -> rotates uc_rt
    const refreshRes1 = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `uc_rt=${firstRt}` },
    });
    expect(refreshRes1.status).toBe(200);
    const rotatedSetCookie = refreshRes1.headers.get('set-cookie') || '';
    const secondRt = extractCookieValue(rotatedSetCookie, 'uc_rt');
    expect(secondRt).toBeTruthy();
    expect(secondRt).not.toBe(firstRt);
    const refreshBody1: any = await refreshRes1.json();

    // Replay the old (already-rotated) refresh token -> 401 AND revokes all sessions + bumps tokenVersion
    const replayRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `uc_rt=${firstRt}` },
    });
    expect(replayRes.status).toBe(401);

    const userAfterReuse = await User.findById(regBody.user.id).select('+refreshTokens');
    expect(userAfterReuse?.refreshTokens).toHaveLength(0);
    expect(userAfterReuse?.tokenVersion).toBe(1);

    // Even the previously valid rotated access token is now rejected with 401 due to tokenVersion mismatch
    const profileAfterReuse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${refreshBody1.token}` },
    });
    expect(profileAfterReuse.status).toBe(401);

    // Even the rotated refresh token is now revoked
    const refreshAfterReuse = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `uc_rt=${secondRt}` },
    });
    expect(refreshAfterReuse.status).toBe(401);
  });

  it('invalidates access token after changePassword and POST /api/auth/logout-all', async () => {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Version User',
        email: 'version@uconext.test',
        password: 'StrongPassword1',
      }),
    });
    const regBody: any = await regRes.json();
    const oldToken = regBody.token as string;

    // Change password -> bumps tokenVersion
    const changeRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'StrongPassword1',
        newPassword: 'EvenStrongerPassword2',
      }),
    });
    expect(changeRes.status).toBe(200);

    const meAfterChange = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oldToken}` },
    });
    expect(meAfterChange.status).toBe(401);

    // Login again, then call /api/auth/logout-all -> invalidates new token too
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'version@uconext.test',
        password: 'EvenStrongerPassword2',
      }),
    });
    const loginBody: any = await loginRes.json();

    const logoutAllRes = await fetch(`${baseUrl}/api/auth/logout-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    expect(logoutAllRes.status).toBe(200);

    const meAfterLogoutAll = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    expect(meAfterLogoutAll.status).toBe(401);
  });

  it('rejects stale tokenVersion on Socket.IO handshake and disconnects sockets when role changes', async () => {
    const { token, user } = await authService.register('Socket User', 'socket@uconext.test', 'StrongPass1', '127.0.0.1');

    // Simulate Socket.IO middleware & connection handler
    let authMiddleware: any;
    let connectionHandler: any;
    const disconnectSockets = vi.fn();
    const fakeIo: any = {
      use: (fn: any) => {
        authMiddleware = fn;
      },
      on: (event: string, fn: any) => {
        if (event === 'connection') connectionHandler = fn;
      },
      in: vi.fn(() => ({ disconnectSockets })),
    };

    configureSocketAuth(fakeIo);
    setIO(fakeIo);

    // Valid tv joins user room
    const validSocket: any = {
      handshake: { auth: { token }, headers: {} },
      data: {},
      join: vi.fn(),
    };
    await new Promise<void>((resolve) => authMiddleware(validSocket, () => resolve()));
    connectionHandler(validSocket);
    expect(validSocket.join).toHaveBeenCalledWith(`user:${user.id}`);

    // Change user role -> disconnects active sockets & bumps tokenVersion
    await authService.updateUserRole(String(user.id), 'admin');
    expect(fakeIo.in).toHaveBeenCalledWith(`user:${user.id}`);
    expect(disconnectSockets).toHaveBeenCalledWith(true);

    // Old token (tv=0) is now rejected from joining privileged rooms
    const staleSocket: any = {
      handshake: { auth: { token }, headers: {} },
      data: {},
      join: vi.fn(),
    };
    await new Promise<void>((resolve) => authMiddleware(staleSocket, () => resolve()));
    connectionHandler(staleSocket);
    expect(staleSocket.join).not.toHaveBeenCalled();

    setIO(null);
  });
});
