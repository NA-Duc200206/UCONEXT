export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packaging'
  | 'shipping'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refund_requested'
  | 'refund_completed';

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packaging', 'shipping', 'cancelled'],
  packaging: ['shipping', 'cancelled'],
  shipping: ['delivered', 'cancelled'],
  delivered: ['completed', 'refund_requested'],
  completed: ['refund_requested'],
  refund_requested: ['refund_completed', 'delivered'],
  cancelled: [],
  refund_completed: [],
};

export function isRestockedStatus(status: string): boolean {
  return status === 'cancelled' || status === 'refund_completed';
}

export function isValidOrderStatus(status: string): status is OrderStatus {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, status);
}

export function assertTransition(from: OrderStatus, to: string): void {
  if (!isValidOrderStatus(to)) {
    const error: any = new Error(`Unknown order status "${to}".`);
    error.statusCode = 400;
    error.code = 'INVALID_TRANSITION';
    throw error;
  }

  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (from === to && allowed.length > 0) {
    return;
  }

  if (!allowed.includes(to)) {
    const error: any = new Error(`Cannot transition order from "${from}" to "${to}".`);
    error.statusCode = 400;
    error.code = 'INVALID_TRANSITION';
    throw error;
  }
}
