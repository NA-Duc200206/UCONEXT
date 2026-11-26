import { describe, it, expect, afterEach, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { emailQueue } from '../src/jobs/emailQueue';
import {
  deliverMailNow,
  emailService,
  resetEmailTransporterForTests,
} from '../src/services/emailService';

describe('emailService & queued delivery', () => {
  afterEach(() => {
    emailQueue.resetForTests();
    resetEmailTransporterForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('queues emails and delivers via dev fallback when SMTP is not configured outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');

    const ok1 = await emailService.sendOrderConfirmation({
      orderId: 'ORD123456',
      customerEmail: 'buyer@uconext.test',
      customerName: 'Alice <Admin>',
      totalAmount: 550000,
      items: [{ name: 'Desk Lamp & Stand', quantity: 2, price: 275000 }],
      shippingAddress: '123 Le Loi, HCMC',
    });
    const ok2 = await emailService.sendOrderStatusUpdate('buyer@uconext.test', 'ORD123456', 'shipping');
    const ok3 = await emailService.sendPasswordResetEmail({
      to: 'buyer@uconext.test',
      name: 'Alice',
      resetUrl: 'http://localhost:3000/reset-password?token=abc',
      expiresInMinutes: 30,
    });

    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(ok3).toBe(true);

    // Drain all 3 queued emails via deliverMailNow
    await emailQueue.drain(deliverMailNow);
    const stats = await emailQueue.getStats();
    expect(stats.delivered).toBe(3);
    expect(stats.pending).toBe(0);
    expect(stats.dead).toBe(0);
  });

  it('rejects delivery in production when SMTP is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');

    const queued = await emailService.sendOrderStatusUpdate('buyer@uconext.test', 'ORD999', 'confirmed');
    expect(queued).toBe(false);

    const direct = await deliverMailNow({
      to: 'buyer@uconext.test',
      subject: 'Test',
      text: 'Test',
      html: '<p>Test</p>',
      consoleTag: 'TEST',
      consoleLines: [],
    });
    expect(direct).toBe(false);
  });

  it('sends HTML-escaped emails via SMTP transporter and returns false if sendMail rejects', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', 'smtp.uconext.test');
    vi.stubEnv('SMTP_PORT', '465');
    vi.stubEnv('SMTP_USER', 'mailer@uconext.test');
    vi.stubEnv('SMTP_PASS', 'super-secret');
    vi.stubEnv('SMTP_FROM', 'UCONEXT <no-reply@uconext.test>');

    const sendMail = vi.fn().mockResolvedValue({ messageId: 'msg-1' });
    const createTransportSpy = vi
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as any);

    const enqueued = await emailService.sendOrderConfirmation({
      orderId: 'ORD<1>',
      customerEmail: 'buyer@uconext.test',
      customerName: '<script>alert("x")</script>',
      totalAmount: 1000000,
      items: [{ name: 'Pro "Studio" Mic', quantity: 1, price: 1000000 }],
      shippingAddress: "10 O'Brien St",
    });
    expect(enqueued).toBe(true);

    const outcome = await emailQueue.processNext(deliverMailNow);
    expect(outcome).toBe('delivered');
    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.uconext.test', port: 465, secure: true })
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mailArgs = sendMail.mock.calls[0][0];
    expect(mailArgs.from).toBe('UCONEXT <no-reply@uconext.test>');
    expect(mailArgs.html).not.toContain('<script>');
    expect(mailArgs.html).toContain('&lt;script&gt;');
    expect(mailArgs.html).toContain('&#39;');

    // Second call reuses cached transporter; simulate transport failure
    sendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));
    const failed = await deliverMailNow({
      to: 'buyer@uconext.test',
      subject: 'Reset',
      text: 'Reset',
      html: '<p>Reset</p>',
      consoleTag: 'PASSWORD RESET',
      consoleLines: [],
    });
    expect(failed).toBe(false);
    expect(createTransportSpy).toHaveBeenCalledTimes(1);
  });
});
