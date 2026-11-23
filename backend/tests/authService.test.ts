import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { User } from '../src/models';
import { authService } from '../src/services/authService';
import { emailService } from '../src/services/emailService';

describe('authService', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('registers a user with hashed password, returns tokens, and sanitizes sensitive fields', async () => {
    const res = await authService.register('Alice Nguyen', 'Alice@Uconext.Test', 'StrongPass1', '127.0.0.1');

    expect(res.token).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(res.user.email).toBe('alice@uconext.test');
    expect(res.user.role).toBe('customer');
    expect((res.user as any).password).toBeUndefined();
    expect((res.user as any).refreshTokens).toBeUndefined();

    // Duplicate email rejected
    await expect(
      authService.register('Alice 2', 'alice@uconext.test', 'StrongPass1', '127.0.0.1')
    ).rejects.toMatchObject({ statusCode: 400 });

    // Weak password rejected
    await expect(
      authService.register('Bob', 'bob@uconext.test', 'weak', '127.0.0.1')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('logs in with valid credentials and rejects invalid ones', async () => {
    await authService.register('Alice Nguyen', 'alice@uconext.test', 'StrongPass1', '127.0.0.1');

    const loggedIn = await authService.login('  ALICE@UCONEXT.TEST ', 'StrongPass1', '127.0.0.1');
    expect(loggedIn.token).toBeTruthy();
    expect(loggedIn.refreshToken).toBeTruthy();
    expect(loggedIn.user.email).toBe('alice@uconext.test');

    await expect(authService.login('alice@uconext.test', 'WrongPass1', '127.0.0.1')).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(authService.login('nobody@uconext.test', 'StrongPass1', '127.0.0.1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('changes password after verifying current password and rejects weak/same passwords', async () => {
    const { user } = await authService.register('Alice Nguyen', 'alice@uconext.test', 'StrongPass1', '127.0.0.1');
    const userDoc = await User.findById(user.id);

    await expect(
      authService.changePassword(userDoc, { currentPassword: 'WrongPass1', newPassword: 'NewStrong2' })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      authService.changePassword(userDoc, { currentPassword: 'StrongPass1', newPassword: 'StrongPass1' })
    ).rejects.toMatchObject({ statusCode: 400 });

    const ok = await authService.changePassword(userDoc, {
      currentPassword: 'StrongPass1',
      newPassword: 'NewStrong2',
    });
    expect(ok).toBe(true);

    await expect(authService.login('alice@uconext.test', 'StrongPass1', '127.0.0.1')).rejects.toMatchObject({
      statusCode: 400,
    });
    const loginNew = await authService.login('alice@uconext.test', 'NewStrong2', '127.0.0.1');
    expect(loginNew.token).toBeTruthy();
  });

  it('rotates refresh tokens on refreshSession and revokes on logout', async () => {
    const { refreshToken } = await authService.register('Alice Nguyen', 'alice@uconext.test', 'StrongPass1', '127.0.0.1');

    const rotated = await authService.refreshSession(refreshToken);
    expect(rotated.token).toBeTruthy();
    expect(rotated.refreshToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(refreshToken);

    // Old refresh token is revoked after rotation
    await expect(authService.refreshSession(refreshToken)).rejects.toMatchObject({ statusCode: 401 });

    // Logout revokes the new refresh token
    await authService.logout(rotated.refreshToken);
    await expect(authService.refreshSession(rotated.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('completes forgotPassword and resetPassword flow and revokes existing sessions', async () => {
    let capturedResetUrl = '';
    vi.spyOn(emailService, 'sendPasswordResetEmail').mockImplementation(async (payload: any) => {
      capturedResetUrl = payload.resetUrl;
      return true as any;
    });

    const { refreshToken } = await authService.register('Alice Nguyen', 'alice@uconext.test', 'StrongPass1', '127.0.0.1');

    // Non-existent email succeeds silently without leaking existence
    await expect(authService.forgotPassword('ghost@uconext.test')).resolves.toBe(true);
    expect(capturedResetUrl).toBe('');

    await authService.forgotPassword('alice@uconext.test');
    expect(capturedResetUrl).toContain('/reset-password?token=');
    const rawToken = new URL(capturedResetUrl).searchParams.get('token')!;
    expect(rawToken).toBeTruthy();

    await authService.resetPassword(rawToken, 'RecoveredPass9', '127.0.0.1');

    // Token cannot be reused
    await expect(authService.resetPassword(rawToken, 'AnotherPass9')).rejects.toMatchObject({ statusCode: 400 });

    // Existing refresh tokens were cleared on password reset
    await expect(authService.refreshSession(refreshToken)).rejects.toMatchObject({ statusCode: 401 });

    // New password works for login
    const loggedIn = await authService.login('alice@uconext.test', 'RecoveredPass9', '127.0.0.1');
    expect(loggedIn.token).toBeTruthy();
  });
});

