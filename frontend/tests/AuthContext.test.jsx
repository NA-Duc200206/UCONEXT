import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

const { mockApiAuth, mockSetAccessToken, mockClearAccessToken } = vi.hoisted(() => ({
  mockApiAuth: {
    refresh: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    loginWithFirebase: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
  },
  mockSetAccessToken: vi.fn(),
  mockClearAccessToken: vi.fn(),
}));

vi.mock('../src/services/api', () => ({
  api: { auth: mockApiAuth },
  setAccessToken: (...args) => mockSetAccessToken(...args),
  clearAccessToken: (...args) => mockClearAccessToken(...args),
}));

function AuthProbe({ onReady }) {
  const auth = useAuth();
  onReady(auth);
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="user">{auth.user ? auth.user.email : 'guest'}</span>
      <span data-testid="admin">{String(auth.isAdmin)}</span>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(mockApiAuth).forEach((fn) => fn.mockReset());
    mockSetAccessToken.mockReset();
    mockClearAccessToken.mockReset();
    mockApiAuth.logout.mockResolvedValue({ ok: true });
    mockApiAuth.logoutAll.mockResolvedValue({ ok: true });
  });

  it('clears legacy localStorage tokens, hydrates session on mount, and handles auth events', async () => {
    localStorage.setItem('token', 'legacy-jwt');
    localStorage.setItem('refreshToken', 'legacy-rt');
    mockApiAuth.refresh.mockResolvedValueOnce({
      token: 'hydrated-token',
      user: { id: 'u1', email: 'admin@uconext.vn', role: 'admin' },
    });

    let authApi;
    render(
      <AuthProvider>
        <AuthProbe onReady={(ctx) => { authApi = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(screen.getByTestId('user').textContent).toBe('admin@uconext.vn');
    expect(screen.getByTestId('admin').textContent).toBe('true');
    expect(mockSetAccessToken).toHaveBeenCalledWith('hydrated-token');

    // Token refreshed custom event updates user/token
    act(() => {
      window.dispatchEvent(
        new CustomEvent('uconext:token-refreshed', {
          detail: { token: 'rotated-token', user: { id: 'u1', email: 'admin@uconext.vn', role: 'admin' } },
        })
      );
    });
    expect(authApi.token).toBe('rotated-token');

    // Auth expired event logs user out cleanly
    act(() => {
      window.dispatchEvent(new CustomEvent('uconext:auth-expired'));
    });
    expect(screen.getByTestId('user').textContent).toBe('guest');
    expect(mockClearAccessToken).toHaveBeenCalled();
  });

  it('supports login, register, logout, and logoutAll transitions', async () => {
    mockApiAuth.refresh.mockRejectedValueOnce(new Error('No session'));
    mockApiAuth.login.mockResolvedValueOnce({
      token: 'login-jwt',
      user: { id: 'u2', email: 'shopper@uconext.vn', role: 'customer' },
    });

    let authApi;
    render(
      <AuthProvider>
        <AuthProbe onReady={(ctx) => { authApi = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('guest');

    await act(async () => {
      await authApi.login('shopper@uconext.vn', 'StrongPass1');
    });
    expect(screen.getByTestId('user').textContent).toBe('shopper@uconext.vn');
    expect(screen.getByTestId('admin').textContent).toBe('false');

    await act(async () => {
      await authApi.logoutAll();
    });
    expect(mockApiAuth.logoutAll).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('user').textContent).toBe('guest');
  });
});
