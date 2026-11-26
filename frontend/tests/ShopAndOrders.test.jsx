import React, { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider, useToast } from '../src/context/ToastContext';
import MyOrders from '../src/pages/MyOrders';
import Shop from '../src/pages/Shop';

const mockGetMyOrders = vi.fn();
const mockGetProducts = vi.fn();
const mockGetRecommended = vi.fn();
const mockGetCategories = vi.fn();
const mockAddToCart = vi.fn();

let mockAuthValue = { user: { id: 'user-42', name: 'Shopper', cart: [] } };

vi.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

vi.mock('../src/context/CartContext', () => ({
  useCart: () => ({ addToCart: mockAddToCart }),
}));

vi.mock('../src/context/WishlistContext', () => ({
  useWishlist: () => ({ isWishlisted: () => false, toggleWishlist: vi.fn() }),
}));

vi.mock('../src/services/socket', () => ({
  subscribeToEvent: () => () => {},
}));

vi.mock('../src/services/api', () => ({
  api: {
    orders: {
      getMyOrders: (...args) => mockGetMyOrders(...args),
      cancel: vi.fn(),
      requestRefund: vi.fn(),
    },
    products: {
      getAll: (...args) => mockGetProducts(...args),
      getRecommended: (...args) => mockGetRecommended(...args),
    },
    categories: {
      getAll: (...args) => mockGetCategories(...args),
    },
  },
}));

function ToastTriggerButton() {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast('Background notice', 'info')}>
      Fire Toast
    </button>
  );
}

describe('Regression guards: Shop pagination stability & MyOrders toast refetch guard', () => {
  beforeEach(() => {
    mockGetMyOrders.mockReset().mockResolvedValue({ orders: [] });
    mockGetCategories.mockReset().mockResolvedValue({ categories: [] });
    mockGetRecommended.mockReset().mockResolvedValue({ products: [], personalized: false });
    mockGetProducts.mockReset().mockImplementation(async ({ page }) => ({
      products: [
        {
          id: `p-${page}`,
          _id: `p-${page}`,
          name: `Catalog Item Page ${page}`,
          price: 450000,
          stock: 10,
          image: '/uploads/item.webp',
        },
      ],
      totalProducts: 24,
      totalPages: 2,
      currentPage: page || 1,
    }));
    mockAddToCart.mockReset();
    mockAuthValue = { user: { id: 'user-42', name: 'Shopper', cart: [] } };
  });

  it('does not refetch MyOrders when a toast fires inside ToastProvider', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <ToastTriggerButton />
          <MyOrders />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(mockGetMyOrders).toHaveBeenCalledTimes(1));

    // Triggering toasts updates ToastContext state; memoized showToast must NOT trigger refetch
    fireEvent.click(screen.getByRole('button', { name: 'Fire Toast' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fire Toast' }));

    await waitFor(() => expect(screen.getAllByText('Background notice').length).toBeGreaterThan(0));
    expect(mockGetMyOrders).toHaveBeenCalledTimes(1);
  });

  it('does not reset Shop page back to 1 when user object identity changes after addToCart', async () => {
    function ShopWrapper() {
      const [, setTick] = useState(0);
      return (
        <div>
          <button
            type="button"
            onClick={() => {
              // Simulate CartContext calling updateUser({ cart: [...] }) creating a new user object with same id
              mockAuthValue = {
                user: { id: 'user-42', name: 'Shopper', cart: [{ productId: 'p-2', quantity: 1 }] },
              };
              setTick((t) => t + 1);
            }}
          >
            Simulate Add To Cart User Update
          </button>
          <Shop />
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/products']}>
        <ToastProvider>
          <ShopWrapper />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Catalog Item Page 1')).toBeInTheDocument());

    // Advance to page 2 via Load More Products
    fireEvent.click(screen.getByRole('button', { name: /Load More Products/i }));
    await waitFor(() => expect(screen.getByText('Catalog Item Page 2')).toBeInTheDocument());
    expect(mockGetProducts).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));

    const callsBeforeUpdate = mockGetProducts.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Simulate Add To Cart User Update' }));

    // Page must remain 2 and no reset-to-page-1 fetch should occur
    await waitFor(() => expect(screen.getByText('Catalog Item Page 2')).toBeInTheDocument());
    const resetToPage1Calls = mockGetProducts.mock.calls
      .slice(callsBeforeUpdate)
      .filter((call) => call[0]?.page === 1);
    expect(resetToPage1Calls).toHaveLength(0);
  });
});
