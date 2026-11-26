import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Cart from '../src/pages/Cart';

const mockNavigate = vi.fn();
const mockClearCart = vi.fn();
const mockCreateOrder = vi.fn();
const mockGetActiveCoupons = vi.fn();
const mockGetMethods = vi.fn();

const mockCartItems = [
  {
    productId: 'prod-100',
    name: 'Mechanical Keyboard',
    price: 1200000,
    quantity: 2,
    stock: 10,
    color: 'Black',
    size: 'TKL',
  },
];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../src/context/CartContext', () => ({
  useCart: () => ({
    cart: mockCartItems,
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    getCartTotal: () => 2400000,
    clearCart: mockClearCart,
  }),
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'David Nguyen', savedAddresses: [] },
  }),
}));

vi.mock('../src/services/api', () => ({
  api: {
    coupons: {
      getActive: (...args) => mockGetActiveCoupons(...args),
      validate: vi.fn(),
    },
    payments: {
      getMethods: (...args) => mockGetMethods(...args),
      createPaymentUrl: vi.fn(),
    },
    orders: {
      create: (...args) => mockCreateOrder(...args),
    },
  },
}));

describe('Cart COD checkout flow', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockClearCart.mockReset().mockResolvedValue(undefined);
    mockGetActiveCoupons.mockReset().mockResolvedValue({ coupons: [] });
    mockGetMethods.mockReset().mockResolvedValue({ cod: true, vnpay: false });
    mockCreateOrder.mockReset().mockResolvedValue({
      order: { id: 'ORD-NEW-123' },
    });
  });

  it('submits COD checkout with expected items, shippingAddress, and paymentMethod and navigates to result', async () => {
    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Proceed to Checkout/i }));

    fireEvent.change(screen.getByPlaceholderText(/0912 345 678/i), {
      target: { value: '0909123456' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Hanoi \/ Ho Chi Minh City/i), {
      target: { value: 'Ho Chi Minh City' },
    });
    fireEvent.change(screen.getByPlaceholderText(/120 Tran Duy Hung/i), {
      target: { value: '88 Nguyen Hue, District 1' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Deliver during business hours/i), {
      target: { value: 'Call before arrival' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Place Order \(COD\)/i }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));

    expect(mockCreateOrder).toHaveBeenCalledWith({
      items: [
        {
          productId: 'prod-100',
          quantity: 2,
          color: 'Black',
          size: 'TKL',
        },
      ],
      shippingAddress: 'David Nguyen | 0909123456 | 88 Nguyen Hue, District 1, Ho Chi Minh City (Note: Call before arrival)',
      paymentMethod: 'cod',
      couponCode: undefined,
    });

    await waitFor(() => {
      expect(mockClearCart).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/payment-result?method=cod&orderId=ORD-NEW-123');
    });
  });
});
