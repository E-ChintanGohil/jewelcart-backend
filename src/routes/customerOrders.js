import express from 'express';
import { param, validationResult } from 'express-validator';
import OrderService from '../services/orderService.js';
import { authenticateCustomer } from './customerAuth.js';
import EmailService from '../services/emailService.js';

const router = express.Router();

// GET /api/customer-orders - Get customer's own orders
router.get('/', authenticateCustomer, async (req, res) => {
  try {
    const { status, limit, offset } = req.query;

    const filters = {
      customer_id: req.customer.id
    };

    if (status) filters.status = status;
    if (limit) filters.limit = limit;
    if (offset) filters.offset = offset;

    const orders = await OrderService.getAll(filters);
    res.json({ orders });
  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/customer-orders/:id - Get specific order (only if it belongs to the customer)
router.get('/:id', authenticateCustomer, [
  param('id').isInt({ min: 1 }).withMessage('Valid order ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const order = await OrderService.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order belongs to the authenticated customer
    if (order.customerId !== req.customer.id) {
      return res.status(403).json({ error: 'Access denied to this order' });
    }

    res.json({ order });
  } catch (error) {
    console.error('Get customer order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /api/customer-orders - Create new order for customer
router.post('/', authenticateCustomer, async (req, res) => {
  try {
    const orderData = {
      ...req.body,
      customerId: req.customer.id
    };

    const order = await OrderService.create(orderData);

    // Send order confirmation email (fire-and-forget)
    EmailService.sendOrderConfirmation(req.customer, order).catch(() => {});

    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Create customer order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

export default router;