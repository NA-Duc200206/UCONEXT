import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaymentResult from '../src/pages/PaymentResult';

const mockVerifyPayment = vi.fn();
const mockRestoreCartIfEmpty = vi.fn();
const mockShowToast = vi.fn();

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

vi.mock('../src/services/api', () => ({
  api: {
    payments: {
      verifyPayment: (...args) => mockVerifyPayment(...args),
    },
  },
}));

vi.mock('../src/context/CartContext', () => ({
  useCart: () => ({ restoreCartIfEmpty: mockRestoreCartIfEmpty }),
}));

vi.mock('../src/context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

describe('PaymentResult', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockVerifyPayment.mockReset();
    mockRestoreCartIfEmpty.mockReset().mockResolvedValue(undefined);
    mockShowToast.mockReset();
  });

  it('restores saved cart snapshot from sessionStorage when VNPAY verification fails', async () => {
    const savedSnapshot = [{ productId: 'p1', name: 'Studio Mic', price: 1200000, quantity: 1 }];
    sessionStorage.setItem('uconext_pending_vnpay_cart', JSON.stringify(savedSnapshot));

    mockVerifyPayment.mockResolvedValueOnce({
      success: false,
      orderId: 'ORD-FAIL-1',
      message: 'Payment cancelled by customer.',
    });

    render(
      <MemoryRouter initialEntries={['/payment-result?vnp_ResponseCode=24&vnp_SecureHash=abc']}>
        <PaymentResult />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Transaction Failed')).toBeInTheDocument());
    expect(mockRestoreCartIfEmpty).toHaveBeenCalledWith(savedSnapshot);
    expect(sessionStorage.getItem('uconext_pending_vnpay_cart')).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith(
      'Payment failed. Your cart items have been restored.',
      'error'
    );
  });

  it('renders COD success confirmation with order code', async () => {
    render(
      <MemoryRouter initialEntries={['/payment-result?method=cod&orderId=ORD-COD-99']}>
        <PaymentResult />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Order placed successfully!')).toBeInTheDocument());
    expect(screen.getByText('#ORD-COD-99')).toBeInTheDocument();
  });
});
