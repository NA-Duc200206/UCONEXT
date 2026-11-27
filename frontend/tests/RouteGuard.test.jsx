import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import RouteGuard from '../src/components/RouteGuard';

let mockAuth = { user: null, loading: false };

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

function LoginProbe() {
  const loc = useLocation();
  return <div data-testid="login-page">Login:{loc.search}</div>;
}

describe('RouteGuard', () => {
  beforeEach(() => {
    mockAuth = { user: null, loading: false };
  });

  it('shows loading state while auth session is hydrating', () => {
    mockAuth = { user: null, loading: true };
    render(
      <MemoryRouter initialEntries={['/orders']}>
        <RouteGuard>
          <div>Orders Secret</div>
        </RouteGuard>
      </MemoryRouter>
    );
    expect(screen.getByText(/Verifying session/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated visitors to /login with encoded redirect query', () => {
    mockAuth = { user: null, loading: false };
    render(
      <MemoryRouter initialEntries={['/orders?tab=pending']}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route
            path="/orders"
            element={
              <RouteGuard>
                <div>Orders Page</div>
              </RouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('login-page').textContent).toBe(
      `Login:?redirect=${encodeURIComponent('/orders?tab=pending')}`
    );
  });

  it('blocks non-admin users from requireAdmin routes and renders content for admins', () => {
    mockAuth = { user: { id: 'u1', role: 'customer' }, loading: false };
    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
          <Route
            path="/admin"
            element={
              <RouteGuard requireAdmin>
                <div>Admin Secret</div>
              </RouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    unmount();

    mockAuth = { user: { id: 'a1', role: 'admin' }, loading: false };
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RouteGuard requireAdmin>
                <div data-testid="admin-secret">Admin Secret</div>
              </RouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('admin-secret')).toBeInTheDocument();
  });
});
