import crypto from 'crypto';
import qs from 'qs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { AuditLog, Category, Coupon, Order, PaymentTransaction, Product, User } from '../src/models';
import { orderService } from '../src/services/orderService';
import { paymentService } from '../src/services/paymentService';
import { emailService } from '../src/services/emailService';
import * as socketConfig from '../src/config/socket';

const TEST_SECRET = 'test_vnpay_secret_key_1234567890_secure';
const TEST_TMN = 'TESTTMN1';

function signVnpayParams(params: Record<string, any>, secret = TEST_SECRET) {
  const keys = Object.keys(params).map(encodeURIComponent).sort();
  const sorted: Record<string, string> = {};
  for (const k of keys) {
    sorted[k] = encodeURIComponent(params[k]).replace(/%20/g, '+');
  }
  const signData = qs.stringify(sorted, { encode: false });
  const vnp_SecureHash = crypto
    .createHmac('sha512', secret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
  return { ...params, vnp_SecureHash };
}

describe('paymentService (VNPAY security, merchant verification, deadlines & reconciliation)', () => {
  beforeAll(async () => {
    process.env.VNPAY_HASH_SECRET = TEST_SECRET;
    process.env.VNPAY_TMN_CODE = TEST_TMN;
    await connectTestDB();
    vi.spyOn(socketConfig, 'emitOrderEvent').mockImplementation(() => {});
    vi.spyOn(emailService, 'sendOrderConfirmation').mockResolvedValue(undefined as any);
    vi.spyOn(emailService, 'sendOrderStatusUpdate').mockResolvedValue(undefined as any);
  });

  afterEach(async () => {
    await clearTestDB();
    vi.clearAllMocks();
    socketConfig.setIO(null);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await disconnectTestDB();
  });

  async function createVnpayOrderFixture(paymentMethod: 'vnpay' | 'cod' = 'vnpay') {
    const owner = await User.create({
      name: 'Owner',
      email: 'owner@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const stranger = await User.create({
      name: 'Stranger',
      email: 'stranger@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const category = await Category.create({ name: 'Audio', slug: 'audio' });
    const product = await Product.create({
      name: 'DAC Amp',
      slug: 'dac-amp',
      price: 1200000,
      stock: 5,
      categoryId: category._id as any,
    });
    const coupon = await Coupon.create({
      code: 'VIP100K',
      discountType: 'fixed',
      discountValue: 100000,
      minOrderAmount: 500000,
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
      usageLimit: 10,
      perUserLimit: 1,
    });

    const order = await orderService.createOrder(owner._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 1 }],
      shippingAddress: '456 Le Loi, HCMC',
      paymentMethod,
      couponCode: 'VIP100K',
    });

    return { owner, stranger, product, coupon, order };
  }

  it('blocks IDOR (non-owner), cancelled orders, COD orders, and nearly-expired deadlines when creating payment URL', async () => {
    const { owner, stranger, order } = await createVnpayOrderFixture('vnpay');

    // Non-owner cannot generate payment URL for owner's order
    await expect(
      paymentService.createPaymentUrl(order.id.toString(), '203.113.1.1, 10.0.0.1', stranger._id.toString())
    ).rejects.toMatchObject({ statusCode: 403 });

    // Owner succeeds and generates collision-free UUID txnRef
    const url1 = new URL(
      await paymentService.createPaymentUrl(order.id.toString(), '203.113.1.1, 10.0.0.1', owner._id.toString())
    );
    const url2 = new URL(
      await paymentService.createPaymentUrl(order.id.toString(), '203.113.1.1', owner._id.toString())
    );
    expect(url1.searchParams.get('vnp_IpAddr')).toBe('203.113.1.1');
    expect(url1.searchParams.get('vnp_TxnRef')).not.toBe(url2.searchParams.get('vnp_TxnRef'));

    // Order with < 2 minutes left before paymentDeadline is rejected
    await Order.findByIdAndUpdate(order.id, {
      $set: { paymentDeadline: new Date(Date.now() + 60 * 1000) },
    });
    await expect(
      paymentService.createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });

    // Cancelled order cannot create payment URL
    await orderService.cancelOrder(order.id.toString(), owner._id.toString());
    await expect(
      paymentService.createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });

    // COD order cannot create VNPAY payment URL
    const codOrder = await orderService.createOrder(owner._id.toString(), {
      items: [{ productId: (await Product.findOne())!._id.toString(), quantity: 1 }],
      shippingAddress: '789 St, HCMC',
      paymentMethod: 'cod',
    });
    await expect(
      paymentService.createPaymentUrl(codOrder.id.toString(), '127.0.0.1', owner._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('verifies TmnCode, TransactionStatus, amount & txnRef, logs PaymentTransactions, and covers all IPN codes (97/01/04/02/00)', async () => {
    const { owner, product, coupon, order } = await createVnpayOrderFixture('vnpay');

    const url1 = new URL(
      await paymentService.createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    );
    const txnRef1 = url1.searchParams.get('vnp_TxnRef')!;

    const url2 = new URL(
      await paymentService.createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    );
    const txnRef2 = url2.searchParams.get('vnp_TxnRef')!;
    expect(txnRef2).not.toBe(txnRef1);

    // 97: invalid checksum
    const badHashRes = await paymentService.handleIpn({
      vnp_TmnCode: TEST_TMN,
      vnp_TxnRef: txnRef2,
      vnp_Amount: String(order.totalAmount * 100),
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_SecureHash: 'deadbeef',
    });
    expect(badHashRes.RspCode).toBe('97');

    // 97: wrong vnp_TmnCode even with valid signature
    const wrongTmnQuery = signVnpayParams({
      vnp_TmnCode: 'WRONG_TMN',
      vnp_TxnRef: txnRef2,
      vnp_Amount: String(order.totalAmount * 100),
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });
    expect((await paymentService.handleIpn(wrongTmnQuery)).RspCode).toBe('97');
    await expect(paymentService.verifyPayment(wrongTmnQuery)).rejects.toMatchObject({ statusCode: 400 });

    // 01: unknown order
    const missingOrderQuery = signVnpayParams({
      vnp_TmnCode: TEST_TMN,
      vnp_TxnRef: `${new Types.ObjectId()}-abc`,
      vnp_Amount: String(order.totalAmount * 100),
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });
    expect((await paymentService.handleIpn(missingOrderQuery)).RspCode).toBe('01');

    // 04: wrong amount
    const wrongAmountQuery = signVnpayParams({
      vnp_TmnCode: TEST_TMN,
      vnp_TxnRef: txnRef2,
      vnp_Amount: '10000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });
    expect((await paymentService.handleIpn(wrongAmountQuery)).RspCode).toBe('04');
    await expect(paymentService.verifyPayment(wrongAmountQuery)).rejects.toMatchObject({ statusCode: 400 });

    // 00: valid IPN confirms payment once
    const validSuccessQuery = signVnpayParams({
      vnp_TmnCode: TEST_TMN,
      vnp_TxnRef: txnRef2,
      vnp_Amount: String(order.totalAmount * 100),
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });
    expect((await paymentService.handleIpn(validSuccessQuery)).RspCode).toBe('00');

    // 02: duplicate IPN on already-confirmed order
    expect((await paymentService.handleIpn(validSuccessQuery)).RspCode).toBe('02');

    // Admin advances order to 'shipping'
    await orderService.updateOrderStatus(order.id.toString(), 'shipping');

    // Subsequent Return URL callback must be idempotent and NOT regress status
    const verifyRes = await paymentService.verifyPayment(validSuccessQuery);
    expect(verifyRes.success).toBe(true);
    const afterShipping = await Order.findById(order.id);
    expect(afterShipping?.status).toBe('shipping');
    expect(afterShipping?.paymentStatus).toBe('paid');

    // Replaying Attempt 1's signed failure callback MUST NOT cancel the paid order
    const oldFailedQuery = signVnpayParams({
      vnp_TmnCode: TEST_TMN,
      vnp_TxnRef: txnRef1,
      vnp_Amount: String(order.totalAmount * 100),
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
    });
    await expect(paymentService.verifyPayment(oldFailedQuery)).rejects.toMatchObject({ statusCode: 400 });

    expect((await Product.findById(product._id))?.stock).toBe(4);
    expect((await Coupon.findById(coupon._id))?.usedCount).toBe(1);

    // Every callback was logged to PaymentTransaction
    const loggedCount = await PaymentTransaction.countDocuments({ orderId: order.id });
    expect(loggedCount).toBeGreaterThanOrEqual(4);
  });

  it('treats vnp_ResponseCode=00 with non-00 vnp_TransactionStatus as failed payment', async () => {
    const { owner, product, order } = await createVnpayOrderFixture('vnpay');
    const url = new URL(
      await paymentService.createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    );
    const txnRef = url.searchParams.get('vnp_TxnRef')!;

    const incompleteTxnQuery = signVnpayParams({
      vnp_TmnCode: TEST_TMN,
      vnp_TxnRef: txnRef,
      vnp_Amount: String(order.totalAmount * 100),
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '01', // incomplete
    });

    const res = await paymentService.verifyPayment(incompleteTxnQuery);
    expect(res.success).toBe(false);

    const updatedOrder = await Order.findById(order.id);
    expect(updatedOrder?.status).toBe('cancelled');
    expect(updatedOrder?.paymentStatus).toBe('failed');
    expect((await Product.findById(product._id))?.stock).toBe(5);
  });

  it('flags paid-after-expiry IPN for reconciliation', async () => {
    const { owner, order } = await createVnpayOrderFixture('vnpay');
    const url = new URL(
      await paymentService.createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    );
    const txnRef = url.searchParams.get('vnp_TxnRef')!;

    // Simulate auto-expiry cancelling the order at minute 15
    await Order.findByIdAndUpdate(order.id, {
      $set: { paymentDeadline: new Date(Date.now() - 60_000) },
    });
    const expired = await orderService.expireStaleVnpayOrders();
    expect(expired).toBe(1);

    const emitToAdmin = vi.fn();
    socketConfig.setIO({
      to: vi.fn((room: string) => ({
        emit: room === 'role:admin' ? emitToAdmin : vi.fn(),
      })),
    } as any);

    // Minute 15.5: VNPAY IPN arrives with successful payment (00 / 00)
    const latePaidIpn = signVnpayParams({
      vnp_TmnCode: TEST_TMN,
      vnp_TxnRef: txnRef,
      vnp_Amount: String(order.totalAmount * 100),
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });

    const ipnRes = await paymentService.handleIpn(latePaidIpn);
    expect(ipnRes).toEqual({ RspCode: '00', Message: 'Confirm Success' });

    const reconciledOrder = await Order.findById(order.id);
    expect(reconciledOrder?.status).toBe('cancelled');
    expect(reconciledOrder?.paymentStatus).toBe('review');

    const auditEntry = await AuditLog.findOne({
      action: 'VNPAY_PAID_AFTER_EXPIRY',
      targetId: String(order.id),
    });
    expect(auditEntry).toBeTruthy();

    expect(emitToAdmin).toHaveBeenCalledWith(
      'order:payment_review',
      expect.objectContaining({ paymentStatus: 'review' })
    );

    // Subsequent duplicate IPN gets 02
    expect((await paymentService.handleIpn(latePaidIpn)).RspCode).toBe('02');
  });
});
