import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import prisma from '../config/prisma.js';
import { authenticateToken, requireStaff } from '../middleware/auth.js';
import { authenticateCustomer } from './customerAuth.js';
import EmailService from '../services/emailService.js';

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ─── Customer: Create Razorpay order ─────────────────────────────────────────
// Called AFTER the DB order is created (via POST /api/customer-orders).
// Returns the Razorpay order so the frontend can open the payment modal.
//
// POST /api/payments/create-order
// Body: { amount (in INR), db_order_id }
router.post('/create-order', authenticateCustomer, [
  body('amount').isFloat({ min: 1 }).withMessage('Valid amount is required'),
  body('db_order_id').isInt({ min: 1 }).withMessage('Valid order ID is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { amount, db_order_id } = req.body;

  try {
    // Verify the order belongs to this customer and is in a payable state
    const order = await prisma.order.findUnique({
      where: { id: parseInt(db_order_id) },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.customerId !== req.customer.id) {
      return res.status(403).json({ error: 'Access denied to this order' });
    }

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: `order_${db_order_id}_${Date.now()}`,
      notes: {
        db_order_id: db_order_id.toString(),
        order_number: order.orderNumber,
      },
    });

    res.json({
      success: true,
      razorpay_order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// ─── Customer: Verify payment and confirm order ───────────────────────────────
// Called by the Razorpay success handler on the frontend.
// Verifies HMAC signature, then marks the DB order as PAID + CONFIRMED
// and records the payment.
//
// POST /api/payments/verify-payment
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, db_order_id }
router.post('/verify-payment', authenticateCustomer, [
  body('razorpay_order_id').notEmpty().withMessage('Razorpay order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Razorpay payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Razorpay signature is required'),
  body('db_order_id').isInt({ min: 1 }).withMessage('Valid DB order ID is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, db_order_id } = req.body;

  // 1. Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Invalid payment signature' });
  }

  try {
    // 2. Verify the order belongs to this customer
    const order = await prisma.order.findUnique({
      where: { id: parseInt(db_order_id) },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.customerId !== req.customer.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // 3. Update order status and create payment record in a transaction
    const [updatedOrder, payment] = await prisma.$transaction([
      prisma.order.update({
        where: { id: parseInt(db_order_id) },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        },
      }),
      prisma.payment.create({
        data: {
          orderId: parseInt(db_order_id),
          paymentMethod: 'RAZORPAY',
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          amount: order.totalAmount,
          status: 'PAID',
          paymentDate: new Date(),
        },
      }),
    ]);

    // Send payment confirmation email (fire-and-forget)
    EmailService.sendPaymentConfirmation(req.customer, updatedOrder, razorpay_payment_id).catch(() => {});

    res.json({
      success: true,
      message: 'Payment verified successfully',
      order_number: updatedOrder.orderNumber,
      payment_id: payment.id,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ success: false, error: 'Payment verification failed' });
  }
});

// ─── Customer: Mark payment as failed ────────────────────────────────────────
// Called by the Razorpay failure handler on the frontend so the order
// reflects the failed payment state and the customer can retry.
//
// POST /api/payments/payment-failed
// Body: { db_order_id, error_code, error_description }
router.post('/payment-failed', authenticateCustomer, [
  body('db_order_id').isInt({ min: 1 }).withMessage('Valid DB order ID is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { db_order_id } = req.body;

  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(db_order_id) },
    });

    if (!order || order.customerId !== req.customer.id) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await prisma.order.update({
      where: { id: parseInt(db_order_id) },
      data: { paymentStatus: 'FAILED' },
    });

    res.json({ success: true, message: 'Order updated with payment failure' });
  } catch (error) {
    console.error('Payment failed update error:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ─── Admin: Get payment details from Razorpay ─────────────────────────────────
// GET /api/payments/payment/:payment_id
router.get('/payment/:payment_id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const payment = await razorpay.payments.fetch(req.params.payment_id);
    res.json({ success: true, payment });
  } catch (error) {
    console.error('Fetch payment error:', error);
    res.status(500).json({ error: 'Failed to fetch payment details' });
  }
});

// ─── Admin: Refund a payment ──────────────────────────────────────────────────
// POST /api/payments/refund
// Body: { payment_id, amount (optional, full refund if omitted), db_order_id }
router.post('/refund', authenticateToken, requireStaff, [
  body('payment_id').notEmpty().withMessage('Payment ID is required'),
  body('db_order_id').isInt({ min: 1 }).withMessage('Valid DB order ID is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { payment_id, amount, db_order_id } = req.body;

  try {
    const refund = await razorpay.payments.refund(payment_id, {
      amount: amount ? Math.round(amount * 100) : undefined,
    });

    const isPartial = !!amount;

    await prisma.$transaction([
      prisma.order.update({
        where: { id: parseInt(db_order_id) },
        data: {
          paymentStatus: isPartial ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
          status: isPartial ? undefined : 'RETURNED',
        },
      }),
      prisma.payment.create({
        data: {
          orderId: parseInt(db_order_id),
          paymentMethod: 'RAZORPAY',
          razorpayPaymentId: refund.id,
          amount: isPartial ? amount : undefined,
          status: 'REFUNDED',
          paymentDate: new Date(),
        },
      }),
    ]);

    res.json({ success: true, refund });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

export default router;
