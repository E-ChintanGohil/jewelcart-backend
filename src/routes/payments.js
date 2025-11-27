import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import db from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Initialize Razorpay (you'll need to add these to environment variables)
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_1234567890',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_secret_key_here'
});

// Create Razorpay order
router.post('/create-order', authenticateToken, async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const options = {
      amount: amount * 100, // Amount in paise
      currency,
      receipt: receipt || `order_${Date.now()}`,
      notes: notes || {}
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      error: 'Failed to create payment order',
      details: error.message
    });
  }
});

// Verify payment
router.post('/verify-payment', authenticateToken, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_details
    } = req.body;

    // Verify signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'your_secret_key_here')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }

    // Payment verified successfully
    // Create order in database
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Insert order
      const orderQuery = `
        INSERT INTO orders (
          customer_id, total_amount, status, payment_id,
          payment_status, shipping_address_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;

      const [orderResult] = await connection.execute(orderQuery, [
        req.user.id,
        order_details.total_amount,
        'confirmed',
        razorpay_payment_id,
        'completed',
        order_details.shipping_address_id
      ]);

      const orderId = orderResult.insertId;

      // Insert order items
      if (order_details.items && order_details.items.length > 0) {
        const itemsQuery = `
          INSERT INTO order_items (order_id, product_id, quantity, price)
          VALUES ?
        `;

        const itemsData = order_details.items.map(item => [
          orderId,
          item.product_id,
          item.quantity,
          item.price
        ]);

        await connection.query(itemsQuery, [itemsData]);
      }

      await connection.commit();

      res.json({
        success: true,
        message: 'Payment verified and order created successfully',
        order_id: orderId,
        payment_id: razorpay_payment_id
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: 'Payment verification failed',
      details: error.message
    });
  }
});

// Get payment status
router.get('/payment/:payment_id', authenticateToken, async (req, res) => {
  try {
    const { payment_id } = req.params;

    const payment = await razorpay.payments.fetch(payment_id);

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      error: 'Failed to fetch payment details',
      details: error.message
    });
  }
});

// Refund payment
router.post('/refund', authenticateToken, async (req, res) => {
  try {
    const { payment_id, amount, notes } = req.body;

    if (!payment_id) {
      return res.status(400).json({ error: 'Payment ID is required' });
    }

    const refundOptions = {
      amount: amount ? amount * 100 : undefined, // Full refund if amount not specified
      notes: notes || {}
    };

    const refund = await razorpay.payments.refund(payment_id, refundOptions);

    // Update order status in database
    const connection = await db.getConnection();
    try {
      const updateQuery = `
        UPDATE orders
        SET status = 'refunded', updated_at = NOW()
        WHERE payment_id = ?
      `;

      await connection.execute(updateQuery, [payment_id]);
    } finally {
      connection.release();
    }

    res.json({
      success: true,
      refund
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      error: 'Failed to process refund',
      details: error.message
    });
  }
});

export default router;