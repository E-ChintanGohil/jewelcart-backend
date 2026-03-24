import nodemailer from 'nodemailer';
import { executeQuery } from '../config/database.js';

// ─── SMTP config cache (5-minute TTL) ────────────────────────────────────────
let cachedConfig = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getSmtpConfig = async () => {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiry) {
    return cachedConfig;
  }

  try {
    const rows = await executeQuery(
      'SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name, smtp_secure FROM settings LIMIT 1'
    );

    if (rows.length > 0 && rows[0].smtp_host && rows[0].smtp_user && rows[0].smtp_password) {
      cachedConfig = {
        host: rows[0].smtp_host,
        port: rows[0].smtp_port || 587,
        user: rows[0].smtp_user,
        pass: rows[0].smtp_password,
        fromEmail: rows[0].smtp_from_email || rows[0].smtp_user,
        fromName: rows[0].smtp_from_name || 'JewelCart',
        secure: !!rows[0].smtp_secure,
      };
      cacheExpiry = now + CACHE_TTL;
      return cachedConfig;
    }
  } catch (error) {
    console.error('[Email] Failed to load SMTP config from DB:', error.message);
  }

  // Fall back to env vars
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    cachedConfig = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      fromEmail: process.env.SMTP_FROM || process.env.SMTP_USER,
      fromName: 'JewelCart',
      secure: process.env.SMTP_PORT === '465',
    };
    cacheExpiry = now + CACHE_TTL;
    return cachedConfig;
  }

  cachedConfig = null;
  cacheExpiry = now + CACHE_TTL;
  return null;
};

const createTransporter = (config) => {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
};

const send = async (to, subject, html) => {
  const config = await getSmtpConfig();
  if (!config) {
    console.log(`[Email] SMTP not configured — skipping: "${subject}" to ${to}`);
    return;
  }
  try {
    const transporter = createTransporter(config);
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    // Never crash the request over an email failure
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, error.message);
  }
};

// ─── Shared layout ────────────────────────────────────────────────────────────
const wrap = async (body) => {
  const config = await getSmtpConfig();
  const contactEmail = config?.fromEmail || '';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 24px auto; background: #fff; border-radius: 8px; overflow: hidden; }
    .header { background: #B45309; padding: 24px 32px; color: #fff; }
    .header h1 { margin: 0; font-size: 22px; letter-spacing: 1px; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .content { padding: 32px; color: #333; }
    .content h2 { margin-top: 0; color: #B45309; font-size: 18px; }
    .info-box { background: #fef9f0; border: 1px solid #fde68a; border-radius: 6px; padding: 16px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-label { color: #6b7280; }
    .info-value { font-weight: 600; color: #111; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .btn { display: inline-block; padding: 12px 24px; background: #B45309; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 20px; }
    .footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>JewelCart</h1>
      <p>Exquisite Handcrafted Jewelry</p>
    </div>
    <div class="content">
      ${body}
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} JewelCart. All rights reserved.<br/>
      Need help? Contact us at <a href="mailto:${contactEmail}" style="color:#B45309">${contactEmail}</a>
    </div>
  </div>
</body>
</html>`;
};

const statusLabel = (status) => ({
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
}[status] ?? status);

const statusColor = (status) => ({
  CONFIRMED: '#065f46',
  SHIPPED: '#1e40af',
  DELIVERED: '#065f46',
  CANCELLED: '#991b1b',
  RETURNED: '#991b1b',
}[status] ?? '#374151');

// ─── Templates ────────────────────────────────────────────────────────────────

const EmailService = {
  /**
   * Invalidate the SMTP config cache (call after settings update)
   */
  invalidateCache() {
    cachedConfig = null;
    cacheExpiry = 0;
  },

  /**
   * Send a test email to verify SMTP configuration
   */
  async sendTestEmail(toEmail) {
    const config = await getSmtpConfig();
    if (!config) {
      throw new Error('SMTP is not configured. Please save your SMTP settings first.');
    }

    const transporter = createTransporter(config);
    const html = await wrap(`
      <h2>SMTP Configuration Test</h2>
      <p>This is a test email from your JewelCart store.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">SMTP Host</span><span class="info-value">${config.host}</span></div>
        <div class="info-row"><span class="info-label">SMTP Port</span><span class="info-value">${config.port}</span></div>
        <div class="info-row"><span class="info-label">From</span><span class="info-value">${config.fromName} &lt;${config.fromEmail}&gt;</span></div>
        <div class="info-row"><span class="info-label">Sent At</span><span class="info-value">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span></div>
      </div>
      <p style="color:#065f46;font-weight:600">Your email configuration is working correctly!</p>
    `);

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: toEmail,
      subject: 'JewelCart — SMTP Test Email',
      html,
    });
  },

  /**
   * Sent when a customer places an order (payment not yet confirmed)
   */
  async sendOrderConfirmation(customer, order) {
    const subject = `Order Confirmed — ${order.orderNumber}`;
    const html = await wrap(`
      <h2>Thank you for your order!</h2>
      <p>Hi ${customer.firstName},</p>
      <p>We've received your order and it's being processed. Here are your order details:</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Order Number</span><span class="info-value">${order.orderNumber}</span></div>
        <div class="info-row"><span class="info-label">Order Date</span><span class="info-value">${new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
        <div class="info-row"><span class="info-label">Total Amount</span><span class="info-value">₹${parseFloat(order.totalAmount).toLocaleString('en-IN')}</span></div>
        <div class="info-row"><span class="info-label">Status</span><span class="info-value">Confirmed</span></div>
      </div>
      <p>You will receive another email when your order is shipped with tracking details.</p>
      <p style="color:#6b7280;font-size:13px">If you have any questions, please reply to this email or contact our support team.</p>
    `);
    await send(customer.email, subject, html);
  },

  /**
   * Sent when admin updates order status
   */
  async sendOrderStatusUpdate(customer, order, newStatus) {
    const label = statusLabel(newStatus);
    const color = statusColor(newStatus);
    const subject = `Order ${order.orderNumber} — Status Update: ${label}`;

    const statusMessages = {
      CONFIRMED: 'Your order has been confirmed and will be processed shortly.',
      PROCESSING: 'Our team is now preparing your order with care.',
      PACKED: 'Your order has been packed and is ready for dispatch.',
      SHIPPED: 'Great news! Your order is on its way to you.',
      DELIVERED: 'Your order has been delivered. We hope you love it!',
      CANCELLED: 'Your order has been cancelled. If you have questions, please contact us.',
      RETURNED: 'Your return has been processed. Refund will be initiated shortly.',
    };

    const message = statusMessages[newStatus] ?? `Your order status has been updated to ${label}.`;

    const html = await wrap(`
      <h2>Order Status Update</h2>
      <p>Hi ${customer.firstName},</p>
      <p>${message}</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Order Number</span><span class="info-value">${order.orderNumber}</span></div>
        <div class="info-row"><span class="info-label">New Status</span><span class="info-value"><span class="status-badge" style="background:${color}20;color:${color}">${label}</span></span></div>
        <div class="info-row"><span class="info-label">Total Amount</span><span class="info-value">₹${parseFloat(order.totalAmount).toLocaleString('en-IN')}</span></div>
      </div>
      <p style="color:#6b7280;font-size:13px">Log in to your account to view full order details and track your shipment.</p>
    `);
    await send(customer.email, subject, html);
  },

  /**
   * Sent after successful payment verification
   */
  async sendPaymentConfirmation(customer, order, paymentId) {
    const subject = `Payment Confirmed — ${order.orderNumber}`;
    const html = await wrap(`
      <h2>Payment Received</h2>
      <p>Hi ${customer.firstName},</p>
      <p>Your payment has been successfully processed. Your order is now confirmed.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Order Number</span><span class="info-value">${order.orderNumber}</span></div>
        <div class="info-row"><span class="info-label">Payment ID</span><span class="info-value" style="font-size:12px;font-family:monospace">${paymentId}</span></div>
        <div class="info-row"><span class="info-label">Amount Paid</span><span class="info-value">₹${parseFloat(order.totalAmount).toLocaleString('en-IN')}</span></div>
        <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="status-badge" style="background:#d1fae5;color:#065f46">Paid</span></span></div>
      </div>
      <p style="color:#6b7280;font-size:13px">Please save this email as your payment receipt. You can also view your order history in your account.</p>
    `);
    await send(customer.email, subject, html);
  },

  /**
   * Sent for password reset — works for both customers and staff
   */
  async sendPasswordReset(email, firstName, resetUrl) {
    const subject = 'Reset your JewelCart password';
    const html = await wrap(`
      <h2>Password Reset Request</h2>
      <p>Hi ${firstName},</p>
      <p>We received a request to reset your password. Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="${resetUrl}" class="btn">Reset My Password</a>
      </div>
      <p style="color:#6b7280;font-size:13px">If you didn't request a password reset, you can safely ignore this email — your password won't be changed.</p>
      <p style="color:#6b7280;font-size:12px;word-break:break-all">Or copy this link: ${resetUrl}</p>
    `);
    await send(email, subject, html);
  },
};

export default EmailService;
