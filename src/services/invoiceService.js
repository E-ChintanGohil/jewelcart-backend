import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import OrderService from './orderService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'invoice.html');
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');

// Load logo once at module init — embed as base64 data URL so Puppeteer doesn't need network access
let LOGO_DATA_URL = '';
try {
  const logoBuffer = fs.readFileSync(LOGO_PATH);
  LOGO_DATA_URL = `data:image/png;base64,${logoBuffer.toString('base64')}`;
} catch (err) {
  console.warn('[Invoice] Logo not found at', LOGO_PATH);
}

const INR = (n) =>
  '&#8377;' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatDate = (d) => {
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatWeight = (w) => {
  const n = Number(w || 0);
  return n > 0 ? `${n.toFixed(3).replace(/\.?0+$/, '')} g` : '—';
};

const buildItemRows = (items) =>
  items
    .map(
      (item) => `
					<tr>
						<th scope="row" class="fw-medium">${escapeHtml(item.productName)}</th>
						<td class="text-center">${formatWeight(item.product?.weight ?? item.weight)}</td>
						<td class="text-center">${item.quantity}</td>
						<td class="text-end">${INR(item.unitPrice)}</td>
						<td class="text-end">${INR(item.totalPrice)}</td>
					</tr>`
    )
    .join('');

const buildAddressLines = (address, customer) => {
  if (!address) {
    return `<li>${escapeHtml(customer.email || '')}</li>`;
  }
  const lines = [
    address.street,
    [address.city, address.state].filter(Boolean).join(', ') + (address.zipCode ? ' - ' + address.zipCode : ''),
    address.country,
    address.phone,
  ].filter((l) => l && l.trim());
  return lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('\n\t\t\t\t\t\t');
};

const getPaymentMethod = (order) => {
  if (order.payments && order.payments.length > 0) {
    const p = order.payments[0];
    if (p.paymentMethod) return p.paymentMethod.toUpperCase();
    if (p.razorpayPaymentId) return 'Online (Razorpay)';
  }
  return order.paymentStatus === 'paid' ? 'Online' : 'Pending';
};

/**
 * Generate a PDF invoice buffer for the given order ID.
 */
export const generateInvoicePDF = async (orderId) => {
  const order = await OrderService.findById(orderId);
  if (!order) throw new Error('Order not found');

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  const invoiceNumber = `INV-${order.orderNumber}`;
  const invoiceDate = formatDate(order.createdAt);
  const customerName = `${order.customerInfo.firstName} ${order.customerInfo.lastName}`.trim();
  const billingAddress = order.billingAddress || order.shippingAddress;
  const placeOfSupply = billingAddress?.state || 'Gujarat';

  // CGST/SGST each at half the total tax
  const halfTax = (order.taxAmount || 0) / 2;

  const discountRow = order.discountAmount > 0
    ? `<tr>
						<td colspan="3"></td>
						<th class="text-end fw-medium text-success">Discount</th>
						<th class="text-end fw-medium text-success">&minus;${INR(order.discountAmount)}</th>
					</tr>`
    : '';

  const shippingRow = order.shippingAmount > 0
    ? `<tr>
						<td colspan="3"></td>
						<th class="text-end fw-medium text-muted">Shipping</th>
						<th class="text-end fw-medium">${INR(order.shippingAmount)}</th>
					</tr>`
    : '';

  const html = template
    .replace(/{{logoDataUrl}}/g, LOGO_DATA_URL)
    .replace(/{{orderNumber}}/g, escapeHtml(order.orderNumber))
    .replace(/{{invoiceNumber}}/g, escapeHtml(invoiceNumber))
    .replace(/{{invoiceDate}}/g, escapeHtml(invoiceDate))
    .replace(/{{paymentMethod}}/g, escapeHtml(getPaymentMethod(order)))
    .replace(/{{placeOfSupply}}/g, escapeHtml(placeOfSupply))
    .replace(/{{customerName}}/g, escapeHtml(customerName))
    .replace(/{{customerAddressLines}}/g, buildAddressLines(billingAddress, order.customerInfo))
    .replace(/{{itemRows}}/g, buildItemRows(order.items))
    .replace(/{{subtotal}}/g, INR(order.subtotal))
    .replace(/{{discountRow}}/g, discountRow)
    .replace(/{{shippingRow}}/g, shippingRow)
    .replace(/{{cgst}}/g, INR(halfTax))
    .replace(/{{sgst}}/g, INR(halfTax))
    .replace(/{{grandTotal}}/g, INR(order.totalAmount));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });
    // Puppeteer v22+ returns Uint8Array — convert to Buffer for res.send()
    const pdfBuffer = Buffer.from(pdfData);
    return { pdfBuffer, orderNumber: order.orderNumber };
  } finally {
    await browser.close();
  }
};
