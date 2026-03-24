import express from 'express';
import { body, param, validationResult } from 'express-validator';
import OrderService from '../services/orderService.js';
import { authenticateToken, requireStaff } from '../middleware/auth.js';
import EmailService from '../services/emailService.js';

const router = express.Router();

// GET /api/orders - Get all orders (staff only)
router.get('/', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { status, payment_status, customer_id, limit, offset } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (payment_status) filters.payment_status = payment_status;
    if (customer_id) filters.customer_id = customer_id;
    if (limit) filters.limit = limit;
    if (offset) filters.offset = offset;

    const orders = await OrderService.getAll(filters);
    res.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/export - Export orders as CSV (staff only)
router.get('/export', authenticateToken, requireStaff, async (req, res) => {
  try {
    const orders = await OrderService.getAll({});

    const escapeCsvField = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ['Order Number', 'Customer Name', 'Email', 'Items Count', 'Subtotal', 'Tax', 'Shipping', 'Discount', 'Total', 'Status', 'Payment Status', 'Date'];
    const rows = orders.map(order => {
      const customerName = order.customerInfo
        ? `${order.customerInfo.firstName || ''} ${order.customerInfo.lastName || ''}`.trim()
        : '';
      const email = order.customerInfo?.email || '';
      const itemsCount = order.items ? order.items.length : 0;
      const subtotal = order.subtotal || 0;
      const tax = order.taxAmount || 0;
      const shipping = order.shippingAmount || 0;
      const discount = order.discountAmount || 0;
      const total = order.totalAmount || 0;
      const status = order.status || '';
      const paymentStatus = order.paymentStatus || '';
      const date = order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : '';

      return [
        order.orderNumber || order.id,
        customerName,
        email,
        itemsCount,
        subtotal,
        tax,
        shipping,
        discount,
        total,
        status,
        paymentStatus,
        date,
      ].map(escapeCsvField).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const today = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${today}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export orders error:', error);
    res.status(500).json({ error: 'Failed to export orders' });
  }
});

// GET /api/orders/:id - Get single order (staff only)
router.get('/:id', authenticateToken, requireStaff, [
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

    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /api/orders - Create new order (staff only)
router.post('/', authenticateToken, requireStaff, [
  body('customerId').isInt({ min: 1 }).withMessage('Valid customer ID is required'),
  body('billingAddressId').isInt({ min: 1 }).withMessage('Valid billing address ID is required'),
  body('shippingAddressId').isInt({ min: 1 }).withMessage('Valid shipping address ID is required'),
  body('items').isArray({ min: 1 }).withMessage('Order must have at least one item'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('Valid product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
  body('subtotal').isFloat({ min: 0 }).withMessage('Subtotal must be positive'),
  body('totalAmount').isFloat({ min: 0 }).withMessage('Total amount must be positive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const order = await OrderService.create(req.body);

    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: error.message || 'Failed to create order' });
  }
});

// PUT /api/orders/:id/status - Update order status (staff only)
router.put('/:id/status', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid order ID is required'),
  body('status').isIn(['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'returned']).withMessage('Invalid status'),
  body('paymentStatus').optional().isIn(['pending', 'paid', 'failed', 'refunded', 'partially_refunded']).withMessage('Invalid payment status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const order = await OrderService.updateStatus(req.params.id, req.body, req.user?.id);

    // Send status update email if status changed (fire-and-forget)
    if (req.body.status && order.customerInfo) {
      EmailService.sendOrderStatusUpdate(
        { firstName: order.customerInfo.firstName, email: order.customerInfo.email },
        order,
        req.body.status.toUpperCase()
      ).catch(() => {});
    }

    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);

    if (error.message === 'Order not found') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// GET /api/orders/stats - Get order statistics (staff only)
router.get('/stats', authenticateToken, requireStaff, async (req, res) => {
  try {
    const stats = await OrderService.getStats();
    res.json({ stats });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

export default router;