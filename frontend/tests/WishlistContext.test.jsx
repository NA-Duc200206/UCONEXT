import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WishlistProvider, useWishlist } from '../src/context/WishlistContext';

const { mockNavigate, mockShowToast, mockWishlistApi } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockShowToast: vi.fn(),
  mockWishlistApi: {
    getAll: vi.fn(),
    toggle: vi.fn(),
    remove: vi.fn(),
  },
}));
let mockAuthUser = null;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser }),
}));

vi.mock('../src/context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../src/services/api', () => ({
  api: { wishlist: mockWishlistApi },
}));

function WishlistProbe({ onReady }) {
  const ctx = useWishlist();
  onReady(ctx);
  return <span data-testid="wl-count">{ctx.wishlistCount}</span>;
}

describe('WishlistContext', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockShowToast.mockReset();
    Object.values(mockWishlistApi).forEach((fn) => fn.mockReset());
    mockAuthUser = null;
  });

  it('redirects guests to /login when attempting to toggle wishlist', async () => {
    let wlApi;
    render(
      <MemoryRouter>
        <WishlistProvider>
          <WishlistProbe onReady={(ctx) => { wlApi = ctx; }} />
        </WishlistProvider>
      </MemoryRouter>
    );

    const res = await act(async () => wlApi.toggleWishlist('prod-1'));
    expect(res).toBe(false);
    expect(mockNavigate).toHaveBeenCalledWith('/login');
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/sign in/i), 'info');
  });

  it('loads wishlist, toggles optimistically, and rolls back on API failure', async () => {
    mockAuthUser = { _id: 'user-1', name: 'Alice' };
    mockWishlistApi.getAll.mockResolvedValueOnce({
      wishlist: [{ _id: 'p1', name: 'Desk Lamp' }],
    });
    mockWishlistApi.toggle.mockRejectedValueOnce(new Error('Network down'));

    let wlApi;
    render(
      <MemoryRouter>
        <WishlistProvider>
          <WishlistProbe onReady={(ctx) => { wlApi = ctx; }} />
        </WishlistProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('wl-count').textContent).toBe('1'));
    expect(wlApi.isWishlisted('p1')).toBe(true);

    // Failed toggle rolls back to count 1
    await act(async () => {
      await wlApi.toggleWishlist('p2', { _id: 'p2', name: 'Mouse' });
    });
    expect(screen.getByTestId('wl-count').textContent).toBe('1');
    expect(mockShowToast).toHaveBeenCalledWith('Network down', 'error');

    // Successful remove updates state
    mockWishlistApi.remove.mockResolvedValueOnce({ wishlist: [] });
    await act(async () => {
      await wlApi.removeFromWishlist('p1');
    });
    expect(screen.getByTestId('wl-count').textContent).toBe('0');
  });
});
