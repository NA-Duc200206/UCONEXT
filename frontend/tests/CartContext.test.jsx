import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { CartProvider, useCart } from '../src/context/CartContext';

const mockSyncCart = vi.fn();
const mockUpdateUser = vi.fn();
let mockAuthState = { user: null, updateUser: mockUpdateUser };

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../src/services/api', () => ({
  api: {
    auth: {
      syncCart: (...args) => mockSyncCart(...args),
    },
  },
}));

function CartConsumer({ onReady }) {
  const ctx = useCart();
  onReady(ctx);
  return (
    <div>
      <span data-testid="count">{ctx.getCartItemsCount()}</span>
      <span data-testid="total">{ctx.getCartTotal()}</span>
    </div>
  );
}

describe('CartContext', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSyncCart.mockReset().mockResolvedValue({ ok: true });
    mockUpdateUser.mockReset();
    mockAuthState = { user: null, updateUser: mockUpdateUser };
  });

  it('manages guest cart items with stock clamping and persists to localStorage', async () => {
    let cartApi;
    render(
      <CartProvider>
        <CartConsumer onReady={(ctx) => { cartApi = ctx; }} />
      </CartProvider>
    );

    await act(async () => {
      cartApi.addToCart({ id: 'p1', name: 'Headphones', price: 500000, stock: 3 }, 2, 'Black', null);
    });
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('total').textContent).toBe('1000000');

    // Adding 5 more clamps at stock = 3
    await act(async () => {
      cartApi.addToCart({ id: 'p1', name: 'Headphones', price: 500000, stock: 3 }, 5, 'Black', null);
    });
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(JSON.parse(localStorage.getItem('cart_guest'))).toHaveLength(1);

    // Updating quantity to 0 removes item
    await act(async () => {
      cartApi.updateQuantity('p1', 0, 'Black', null);
    });
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('merges guest cart into user cart on login and clamps combined quantity <= stock', async () => {
    localStorage.setItem(
      'cart_guest',
      JSON.stringify([
        { productId: 'p1', name: 'Desk Lamp', price: 300000, stock: 5, quantity: 4, color: 'White', size: null },
        { productId: 'p2', name: 'USB Hub', price: 200000, stock: 10, quantity: 1, color: null, size: null },
      ])
    );

    mockAuthState = {
      user: {
        id: 'user-1',
        cart: [
          { productId: 'p1', name: 'Desk Lamp', price: 300000, stock: 5, quantity: 3, color: 'White', size: null },
        ],
      },
      updateUser: mockUpdateUser,
    };

    let cartApi;
    render(
      <CartProvider>
        <CartConsumer onReady={(ctx) => { cartApi = ctx; }} />
      </CartProvider>
    );

    await waitFor(() => {
      expect(mockSyncCart).toHaveBeenCalledTimes(1);
    });

    const syncedCart = mockSyncCart.mock.calls[0][0];
    const lamp = syncedCart.find((i) => i.productId === 'p1');
    const hub = syncedCart.find((i) => i.productId === 'p2');
    // 3 (db) + 4 (guest) = 7, clamped to stock 5
    expect(lamp.quantity).toBe(5);
    expect(hub.quantity).toBe(1);
    expect(localStorage.getItem('cart_guest')).toBeNull();
    expect(cartApi.getCartItemsCount()).toBe(6);
  });
});
