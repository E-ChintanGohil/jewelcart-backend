import express from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../config/prisma.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { authenticateCustomer } from './customerAuth.js';

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const calculateDiscount = (coupon, subtotal) => {
  const sub = parseFloat(subtotal);
  if (coupon.discountType === 'PERCENTAGE') {
    return (sub * parseFloat(coupon.discountValue)) / 100;
  }
  return Math.min(parseFloat(coupon.discountValue), sub);
};

const isCouponValid = (coupon, subtotal) => {
  if (!coupon.isActive) return { valid: false, reason: 'Coupon is inactive' };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { valid: false, reason: 'Coupon has expired' };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { valid: false, reason: 'Coupon usage limit reached' };
  if (coupon.minOrderAmount && parseFloat(subtotal) < parseFloat(coupon.minOrderAmount)) {
    return { valid: false, reason: `Minimum order amount is ₹${parseFloat(coupon.minOrderAmount).toFixed(0)}` };
  }
  return { valid: true };
};

// ─── Customer: Validate coupon ────────────────────────────────────────────────
// POST /api/coupons/validate
// Body: { code, orderAmount }
router.post('/validate', authenticateCustomer, [
  body('code').trim().notEmpty().withMessage('Coupon code is required'),
  body('orderAmount').isFloat({ min: 0 }).withMessage('Valid order amount is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { code, orderAmount } = req.body;

  try {
    const coupon = await prisma.coupon.findFirst({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      return res.status(404).json({ valid: false, error: 'Invalid coupon code' });
    }

    const check = isCouponValid(coupon, orderAmount);
    if (!check.valid) {
      return res.status(400).json({ valid: false, error: check.reason });
    }

    const discountAmount = calculateDiscount(coupon, orderAmount);

    res.json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: parseFloat(coupon.discountValue),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

// ─── Admin: List all coupons ──────────────────────────────────────────────────
// GET /api/coupons
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ coupons: coupons.map(c => ({
      ...c,
      discountValue: parseFloat(c.discountValue),
      minOrderAmount: c.minOrderAmount ? parseFloat(c.minOrderAmount) : null,
    })) });
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

// ─── Admin: Create coupon ─────────────────────────────────────────────────────
// POST /api/coupons
router.post('/', authenticateToken, requireAdmin, [
  body('code').trim().notEmpty().withMessage('Code is required'),
  body('discountType').isIn(['PERCENTAGE', 'FIXED']).withMessage('discountType must be PERCENTAGE or FIXED'),
  body('discountValue').isFloat({ min: 0.01 }).withMessage('discountValue must be > 0'),
  body('minOrderAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('maxUses').optional({ nullable: true }).isInt({ min: 1 }),
  body('expiresAt').optional({ nullable: true }).isISO8601(),
  body('isActive').optional().isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { code, discountType, discountValue, minOrderAmount, maxUses, expiresAt, isActive } = req.body;

  try {
    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        discountType,
        discountValue: parseFloat(discountValue),
        minOrderAmount: minOrderAmount != null ? parseFloat(minOrderAmount) : null,
        maxUses: maxUses != null ? parseInt(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    res.status(201).json({ message: 'Coupon created', coupon: {
      ...coupon,
      discountValue: parseFloat(coupon.discountValue),
      minOrderAmount: coupon.minOrderAmount ? parseFloat(coupon.minOrderAmount) : null,
    } });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Coupon code already exists' });
    }
    console.error('Create coupon error:', error);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// ─── Admin: Update coupon ─────────────────────────────────────────────────────
// PUT /api/coupons/:id
router.put('/:id', authenticateToken, requireAdmin, [
  param('id').isInt({ min: 1 }),
  body('discountType').optional().isIn(['PERCENTAGE', 'FIXED']),
  body('discountValue').optional().isFloat({ min: 0.01 }),
  body('minOrderAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('maxUses').optional({ nullable: true }).isInt({ min: 1 }),
  body('expiresAt').optional({ nullable: true }).isISO8601(),
  body('isActive').optional().isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { discountType, discountValue, minOrderAmount, maxUses, expiresAt, isActive } = req.body;
  const updateData = {};

  if (discountType !== undefined) updateData.discountType = discountType;
  if (discountValue !== undefined) updateData.discountValue = parseFloat(discountValue);
  if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount != null ? parseFloat(minOrderAmount) : null;
  if (maxUses !== undefined) updateData.maxUses = maxUses != null ? parseInt(maxUses) : null;
  if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (isActive !== undefined) updateData.isActive = isActive;

  try {
    const coupon = await prisma.coupon.update({
      where: { id: parseInt(req.params.id) },
      data: updateData,
    });

    res.json({ message: 'Coupon updated', coupon: {
      ...coupon,
      discountValue: parseFloat(coupon.discountValue),
      minOrderAmount: coupon.minOrderAmount ? parseFloat(coupon.minOrderAmount) : null,
    } });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Coupon not found' });
    console.error('Update coupon error:', error);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

// ─── Admin: Delete coupon ─────────────────────────────────────────────────────
// DELETE /api/coupons/:id
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await prisma.coupon.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Coupon deleted' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Coupon not found' });
    if (error.code === 'P2003') {
      // Has orders — deactivate instead
      await prisma.coupon.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } });
      return res.json({ message: 'Coupon deactivated (has existing orders)' });
    }
    console.error('Delete coupon error:', error);
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

export default router;
