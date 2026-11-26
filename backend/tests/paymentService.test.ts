import crypto from 'crypto';
import qs from 'qs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Category, Coupon, Order, Product, User } from '../src/models';
import { orderService } from '../src/services/orderService';
import { paymentService } from '../src/services/paymentService';
import { emailService } from '../src/services/emailService';
import * as socketConfig from '../src/config/socket';

const TEST_SECRET = 'test_vnpay_secret_key_1234567890_secure';

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

describe('paymentService (VNPAY security & idempotency)', () => {
  beforeAll(async () => {
    process.env.PAYMENTS_VNPAY_ENABLED = 'true';
    process.env.VNPAY_HASH_SECRET = TEST_SECRET;
    process.env.VNPAY_TMN_CODE = 'TESTTMN1';
    await connectTestDB();
    vi.spyOn(socketConfig, 'emitEvent').mockImplementation(() => {});
    vi.spyOn(emailService, 'sendOrderConfirmation').mockResolvedValue(undefined as any);
    vi.spyOn(emailService, 'sendOrderStatusUpdate').mockResolvedValue(undefined as any);
  });

  afterEach(async () => {
    await clearTestDB();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
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

  it('blocks IDOR (non-owner), cancelled orders, and COD orders when creating payment URL', async () => {
    const { owner, stranger, order } = await createVnpayOrderFixture('vnpay');

    // Non-owner cannot generate payment URL for owner's order
    await expect(
      (paymentService as any).createPaymentUrl(order.id.toString(), '203.113.1.1, 10.0.0.1', stranger._id.toString())
    ).rejects.toMatchObject({ statusCode: 403 });

    // Owner succeeds and first client IP is extracted cleanly
    const urlStr = await (paymentService as any).createPaymentUrl(
      order.id.toString(),
      '203.113.1.1, 10.0.0.1',
      owner._id.toString()
    );
    const parsedUrl = new URL(urlStr);
    expect(parsedUrl.searchParams.get('vnp_IpAddr')).toBe('203.113.1.1');

    // Cancelled order cannot create payment URL
    await orderService.cancelOrder(order.id.toString(), owner._id.toString());
    await expect(
      (paymentService as any).createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });

    // COD order cannot create VNPAY payment URL
    const codOrder = await orderService.createOrder(owner._id.toString(), {
      items: [{ productId: (await Product.findOne())!._id.toString(), quantity: 1 }],
      shippingAddress: '789 St, HCMC',
      paymentMethod: 'cod',
    });
    await expect(
      (paymentService as any).createPaymentUrl(codOrder.id.toString(), '127.0.0.1', owner._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('verifies amount & txnRef, stays idempotent across IPN + Return URL, and blocks replay of old failed callbacks on paid orders', async () => {
    const { owner, product, coupon, order } = await createVnpayOrderFixture('vnpay');

    // Attempt 1 URL
    const url1 = new URL(
      await (paymentService as any).createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    );
    const txnRef1 = url1.searchParams.get('vnp_TxnRef')!;

    // Attempt 2 URL (new vnpayTxnRef stored on order)
    const url2 = new URL(
      await (paymentService as any).createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    );
    const txnRef2 = url2.searchParams.get('vnp_TxnRef')!;
    expect(txnRef2).not.toBe(txnRef1);

    // Wrong amount in verifyPayment must be rejected (totalAmount = 1,100,000 => vnp_Amount = 110000000)
    const wrongAmountQuery = signVnpayParams({
      vnp_TxnRef: txnRef2,
      vnp_Amount: '10000', // 100 VND instead of 1,100,000 VND
      vnp_ResponseCode: '00',
    });
    await expect(paymentService.verifyPayment(wrongAmountQuery)).rejects.toMatchObject({ statusCode: 400 });

    // Valid IPN confirms payment once
    const validSuccessQuery = signVnpayParams({
      vnp_TxnRef: txnRef2,
      vnp_Amount: String(order.totalAmount * 100),
      vnp_ResponseCode: '00',
    });
    const ipnRes = await paymentService.handleIpn(validSuccessQuery);
    expect(ipnRes.RspCode).toBe('00');

    // Admin advances order to 'shipping'
    await orderService.updateOrderStatus(order.id.toString(), 'shipping');

    // Subsequent Return URL callback must be idempotent and NOT regress status from 'shipping' back to 'confirmed'
    const verifyRes = await paymentService.verifyPayment(validSuccessQuery);
    expect(verifyRes.success).toBe(true);
    const afterShipping = await Order.findById(order.id);
    expect(afterShipping?.status).toBe('shipping');
    expect(afterShipping?.paymentStatus).toBe('paid');

    // Replaying Attempt 1's signed failure callback MUST NOT cancel the paid order or restock inventory
    const oldFailedQuery = signVnpayParams({
      vnp_TxnRef: txnRef1,
      vnp_Amount: String(order.totalAmount * 100),
      vnp_ResponseCode: '24',
    });
    await expect(paymentService.verifyPayment(oldFailedQuery)).rejects.toMatchObject({ statusCode: 400 });

    const finalOrder = await Order.findById(order.id);
    expect(finalOrder?.status).toBe('shipping');
    expect(finalOrder?.paymentStatus).toBe('paid');
    expect((await Product.findById(product._id))?.stock).toBe(4);
    expect((await Coupon.findById(coupon._id))?.usedCount).toBe(1);
  });

  it('refuses VNPAY order creation and callbacks with 503 when VNPAY is disabled', async () => {
    const { owner, product, order } = await createVnpayOrderFixture('cod');

    vi.stubEnv('PAYMENTS_VNPAY_ENABLED', 'false');
    expect(paymentService.getAvailableMethods()).toEqual({ cod: true, vnpay: false });

    await expect(
      orderService.createOrder(owner._id.toString(), {
        items: [{ productId: product._id.toString(), quantity: 1 }],
        shippingAddress: '456 Le Loi, HCMC',
        paymentMethod: 'vnpay',
      })
    ).rejects.toMatchObject({ statusCode: 503 });

    await expect(
      paymentService.createPaymentUrl(order.id.toString(), '127.0.0.1', owner._id.toString())
    ).rejects.toMatchObject({ statusCode: 503 });

    const forged = signVnpayParams(
      {
        vnp_TxnRef: `${order.id}-1`,
        vnp_ResponseCode: '00',
        vnp_Amount: String(order.totalAmount * 100),
      },
      'mock_hash_secret'
    );

    await expect(paymentService.verifyPayment(forged)).rejects.toMatchObject({ statusCode: 503 });
    expect(await paymentService.handleIpn(forged)).toEqual({
      RspCode: '99',
      Message: 'Payment gateway disabled',
    });
  });
});
