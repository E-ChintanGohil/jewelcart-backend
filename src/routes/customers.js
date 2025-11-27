import express from 'express';
import { body, param, validationResult } from 'express-validator';
import CustomerService from '../services/customerService.js';
import { authenticateToken, requireStaff } from '../middleware/auth.js';

const router = express.Router();

// GET /api/customers - Get all customers (staff only)
router.get('/', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { status, search, limit, offset } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (search) filters.search = search;
    if (limit) filters.limit = limit;
    if (offset) filters.offset = offset;

    const customers = await CustomerService.getAll(filters);
    res.json({ customers });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// GET /api/customers/:id - Get single customer (staff only)
router.get('/:id', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid customer ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const customer = await CustomerService.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ customer });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// POST /api/customers - Create new customer (staff only)
router.post('/', authenticateToken, requireStaff, [
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').optional().trim(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('leadSource').optional().trim(),
  body('status').optional().isIn(['lead', 'customer', 'vip']).withMessage('Invalid status'),
  body('address').optional().isObject().withMessage('Address must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const customer = await CustomerService.create(req.body);

    res.status(201).json({
      message: 'Customer created successfully',
      customer
    });
  } catch (error) {
    console.error('Create customer error:', error);

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Customer with this email already exists' });
    }

    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// PUT /api/customers/:id - Update customer (staff only)
router.put('/:id', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid customer ID is required'),
  body('firstName').optional().trim().isLength({ min: 1 }).withMessage('First name cannot be empty'),
  body('lastName').optional().trim().isLength({ min: 1 }).withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').optional().trim(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('status').optional().isIn(['lead', 'customer', 'vip']).withMessage('Invalid status'),
  body('address').optional().isObject().withMessage('Address must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const customer = await CustomerService.update(req.params.id, req.body);

    res.json({
      message: 'Customer updated successfully',
      customer
    });
  } catch (error) {
    console.error('Update customer error:', error);

    if (error.message === 'Customer not found') {
      return res.status(404).json({ error: error.message });
    }

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Customer with this email already exists' });
    }

    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// POST /api/customers/:id/notes - Add customer note (staff only)
router.post('/:id/notes', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid customer ID is required'),
  body('note').trim().isLength({ min: 1 }).withMessage('Note is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { note } = req.body;
    const newNote = await CustomerService.addNote(req.params.id, note, req.user?.id);

    res.status(201).json({
      message: 'Note added successfully',
      note: newNote
    });
  } catch (error) {
    console.error('Add customer note error:', error);

    if (error.message === 'Customer not found') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to add note' });
  }
});

export default router;