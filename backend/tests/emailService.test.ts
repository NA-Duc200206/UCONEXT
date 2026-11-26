import { describe, it, expect, afterEach, vi } from 'vitest';
import nodemailer from 'nodemailer';

describe('emailService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses dev console fallback when SMTP is not configured outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { emailService } = await import('../src/services/emailService');

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
    expect(logSpy).toHaveBeenCalled();
  });

  it('returns false in production when SMTP is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { emailService } = await import('../src/services/emailService');

    const delivered = await emailService.sendOrderStatusUpdate('buyer@uconext.test', 'ORD999', 'confirmed');
    expect(delivered).toBe(false);
    expect(errSpy).toHaveBeenCalled();
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

    const { emailService } = await import('../src/services/emailService');

    const sent = await emailService.sendOrderConfirmation({
      orderId: 'ORD<1>',
      customerEmail: 'buyer@uconext.test',
      customerName: '<script>alert("x")</script>',
      totalAmount: 1000000,
      items: [{ name: 'Pro "Studio" Mic', quantity: 1, price: 1000000 }],
      shippingAddress: "10 O'Brien St",
    });

    expect(sent).toBe(true);
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
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await emailService.sendPasswordResetEmail({
      to: 'buyer@uconext.test',
      name: 'Alice',
      resetUrl: 'https://uconext.test/reset?t=1',
      expiresInMinutes: 15,
    });
    expect(failed).toBe(false);
    expect(createTransportSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
  });
});
