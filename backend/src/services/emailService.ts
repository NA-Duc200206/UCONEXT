import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../config/logger';
import { emailQueue, EmailJobPayload } from '../jobs/emailQueue';

/**
 * Email Notification Service for UCONEXT.
 * Enqueues transactional emails onto EmailQueue (Redis list with 5x exponential backoff)
 * so checkout and auth flows never fail when an upstream SMTP relay hiccups.
 */

interface OrderNotificationData {
  orderId: string;
  customerEmail: string;
  customerName: string;
  totalAmount: number;
  items: Array<{ name: string; quantity: number; price: number }>;
  shippingAddress: string;
}

interface PasswordResetEmailData {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}

let cachedTransporter: Transporter | null = null;

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) return null;
  if (cachedTransporter) return cachedTransporter;

  const port = Number(process.env.SMTP_PORT || 587);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return cachedTransporter;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function resetEmailTransporterForTests(): void {
  cachedTransporter = null;
}

export async function deliverMailNow(payload: EmailJobPayload): Promise<boolean> {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      if (process.env.NODE_ENV === 'production') {
        logger.error({ tag: payload.consoleTag }, 'SMTP is not configured in production; skipping email delivery');
        return false;
      }
      logger.info(
        {
          tag: payload.consoleTag,
          to: payload.to,
          subject: payload.subject,
          details: payload.consoleLines,
        },
        'Email dev fallback delivery'
      );
      return true;
    }

    const from = process.env.SMTP_FROM || `UCONEXT <${process.env.SMTP_USER}>`;
    await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return true;
  } catch (err: any) {
    logger.error({ err, tag: payload.consoleTag }, 'Failed to send transactional email');
    return false;
  }
}

async function enqueueMail(payload: EmailJobPayload): Promise<boolean> {
  if (process.env.NODE_ENV === 'production' && !isSmtpConfigured()) {
    logger.error({ tag: payload.consoleTag }, 'SMTP is not configured in production; rejecting email enqueue');
    return false;
  }

  try {
    await emailQueue.enqueue(payload);
    return true;
  } catch (err: any) {
    logger.error({ err, tag: payload.consoleTag }, 'Failed to enqueue transactional email');
    return false;
  }
}

export const emailService = {
  /**
   * Queue order confirmation email to customer
   */
  async sendOrderConfirmation(data: OrderNotificationData): Promise<boolean> {
    const formattedTotal = `${data.totalAmount.toLocaleString('vi-VN')} VND`;
    const itemsSummary = data.items.map((i) => `${i.name} (x${i.quantity})`).join(', ');
    const itemsHtml = data.items
      .map(
        (i) =>
          `<li>${escapeHtml(i.name)} &times; ${i.quantity} &mdash; ${i.price.toLocaleString('vi-VN')} VND</li>`
      )
      .join('');

    return enqueueMail({
      to: data.customerEmail,
      subject: `UCONEXT — Order Confirmation #${data.orderId}`,
      text: [
        `Hello ${data.customerName},`,
        `Your order #${data.orderId} has been received.`,
        `Total: ${formattedTotal}`,
        `Items: ${itemsSummary}`,
        `Delivery Address: ${data.shippingAddress}`,
      ].join('\n'),
      html: `
        <div style="font-family: 'Plus Jakarta Sans', Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
          <h2 style="color: #2454F4;">UCONEXT Order Confirmation</h2>
          <p>Hello <strong>${escapeHtml(data.customerName)}</strong>,</p>
          <p>Thank you for your order <strong>#${escapeHtml(data.orderId)}</strong>.</p>
          <ul>${itemsHtml}</ul>
          <p><strong>Total:</strong> ${formattedTotal}</p>
          <p><strong>Delivery Address:</strong> ${escapeHtml(data.shippingAddress)}</p>
          <p style="color: #64748b; font-size: 13px;">Status: Confirmed - Pending Processing</p>
        </div>
      `,
      consoleTag: 'ORDER CONFIRMATION',
      consoleLines: [
        `Customer: ${data.customerName}`,
        `Order ID: #${data.orderId}`,
        `Total: ${formattedTotal}`,
        `Items: ${itemsSummary}`,
        `Delivery Address: ${data.shippingAddress}`,
      ],
    });
  },

  /**
   * Queue order status update email
   */
  async sendOrderStatusUpdate(customerEmail: string, orderId: string, status: string): Promise<boolean> {
    const normalizedStatus = status.toUpperCase();
    return enqueueMail({
      to: customerEmail,
      subject: `UCONEXT — Order #${orderId} Update: ${normalizedStatus}`,
      text: `Your order #${orderId} status has been updated to: ${normalizedStatus}.`,
      html: `
        <div style="font-family: 'Plus Jakarta Sans', Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
          <h2 style="color: #2454F4;">Order Status Updated</h2>
          <p>Your order <strong>#${escapeHtml(orderId)}</strong> is now:</p>
          <p style="display: inline-block; padding: 8px 14px; border-radius: 8px; background: #eff6ff; color: #2454F4; font-weight: 700;">
            ${escapeHtml(normalizedStatus)}
          </p>
        </div>
      `,
      consoleTag: 'ORDER STATUS UPDATE',
      consoleLines: [`Order ID: #${orderId}`, `New Status: ${normalizedStatus}`],
    });
  },

  /**
   * Queue password reset link email
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<boolean> {
    return enqueueMail({
      to: data.to,
      subject: 'UCONEXT — Reset Your Password',
      text: [
        `Hello ${data.name},`,
        `We received a request to reset your UCONEXT password.`,
        `Open this link within ${data.expiresInMinutes} minutes to set a new password:`,
        data.resetUrl,
        `If you did not request this, you can safely ignore this email.`,
      ].join('\n'),
      html: `
        <div style="font-family: 'Plus Jakarta Sans', Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
          <h2 style="color: #2454F4;">Reset Your Password</h2>
          <p>Hello <strong>${escapeHtml(data.name)}</strong>,</p>
          <p>We received a request to reset your UCONEXT account password. Click the button below within <strong>${data.expiresInMinutes} minutes</strong>:</p>
          <p style="margin: 24px 0;">
            <a href="${escapeHtml(data.resetUrl)}" style="background: #2454F4; color: #ffffff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 600;">
              Reset Password
            </a>
          </p>
          <p style="font-size: 13px; color: #64748b;">Or copy this link: ${escapeHtml(data.resetUrl)}</p>
          <p style="font-size: 12px; color: #94a3b8;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
      consoleTag: 'PASSWORD RESET',
      consoleLines: [
        `User: ${data.name}`,
        `Reset URL: ${data.resetUrl}`,
        `Expires In: ${data.expiresInMinutes} minutes`,
      ],
    });
  },
};
