import express from 'express';
import { body, param, validationResult } from 'express-validator';
import MaterialService from '../services/materialService.js';
import { authenticateToken, requireStaff } from '../middleware/auth.js';

const router = express.Router();

// GET /api/materials - Get all materials with karats
router.get('/', async (req, res) => {
  try {
    const { type, is_active } = req.query;

    const filters = {};
    if (type) filters.type = type.toUpperCase();
    if (is_active !== undefined) filters.is_active = is_active === 'true';

    const materials = await MaterialService.getAll(filters);
    res.json(materials);
  } catch (error) {
    console.error('Get materials error:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

// GET /api/materials/:id - Get single material
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Valid material ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const material = await MaterialService.findById(req.params.id);

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    res.json({ material });
  } catch (error) {
    console.error('Get material error:', error);
    res.status(500).json({ error: 'Failed to fetch material' });
  }
});

// POST /api/materials - Create new material (staff only)
router.post('/', authenticateToken, requireStaff, [
  body('name').trim().isLength({ min: 1 }).withMessage('Material name is required'),
  body('type').isIn(['GOLD', 'SILVER']).withMessage('Material type must be GOLD or SILVER'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, type, isActive = true } = req.body;

    const material = await MaterialService.create({
      name,
      type,
      isActive
    });

    res.status(201).json({
      message: 'Material created successfully',
      material
    });
  } catch (error) {
    console.error('Create material error:', error);

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Material with this name already exists' });
    }

    res.status(500).json({ error: 'Failed to create material' });
  }
});

// PUT /api/materials/:id - Update material (staff only)
router.put('/:id', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid material ID is required'),
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Material name cannot be empty'),
  body('type').optional().isIn(['GOLD', 'SILVER']).withMessage('Material type must be GOLD or SILVER'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, type, isActive } = req.body;

    const material = await MaterialService.update(req.params.id, {
      name,
      type,
      isActive
    });

    res.json({
      message: 'Material updated successfully',
      material
    });
  } catch (error) {
    console.error('Update material error:', error);

    if (error.message === 'Material not found') {
      return res.status(404).json({ error: error.message });
    }

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Material with this name already exists' });
    }

    res.status(500).json({ error: 'Failed to update material' });
  }
});

// DELETE /api/materials/:id - Delete material (staff only)
router.delete('/:id', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid material ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const deleted = await MaterialService.delete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Material not found' });
    }

    res.json({ message: 'Material deleted successfully' });
  } catch (error) {
    console.error('Delete material error:', error);

    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'Cannot delete material with associated products or karats'
      });
    }

    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// POST /api/materials/:id/karats - Create new karat for material (staff only)
router.post('/:id/karats', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid material ID is required'),
  body('value').trim().isLength({ min: 1 }).withMessage('Karat value is required'),
  body('purity').isFloat({ min: 0, max: 100 }).withMessage('Purity must be between 0 and 100'),
  body('pricePerGram').isFloat({ min: 0 }).withMessage('Price per gram must be a positive number'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { value, purity, pricePerGram, isActive = true } = req.body;

    const karat = await MaterialService.createKarat(req.params.id, {
      value,
      purity,
      pricePerGram,
      isActive
    });

    res.status(201).json({
      message: 'Karat created successfully',
      karat
    });
  } catch (error) {
    console.error('Create karat error:', error);

    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Material not found' });
    }

    res.status(500).json({ error: 'Failed to create karat' });
  }
});

// PUT /api/materials/karats/:karatId - Update karat (staff only)
router.put('/karats/:karatId', authenticateToken, requireStaff, [
  param('karatId').isInt({ min: 1 }).withMessage('Valid karat ID is required'),
  body('value').optional().trim().isLength({ min: 1 }).withMessage('Karat value cannot be empty'),
  body('purity').optional().isFloat({ min: 0, max: 100 }).withMessage('Purity must be between 0 and 100'),
  body('pricePerGram').optional().isFloat({ min: 0 }).withMessage('Price per gram must be a positive number'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { value, purity, pricePerGram, isActive } = req.body;

    const karat = await MaterialService.updateKarat(req.params.karatId, {
      value,
      purity,
      pricePerGram,
      isActive
    });

    res.json({
      message: 'Karat updated successfully',
      karat
    });
  } catch (error) {
    console.error('Update karat error:', error);

    if (error.message === 'Karat not found') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to update karat' });
  }
});

// DELETE /api/materials/karats/:karatId - Delete karat (staff only)
router.delete('/karats/:karatId', authenticateToken, requireStaff, [
  param('karatId').isInt({ min: 1 }).withMessage('Valid karat ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const deleted = await MaterialService.deleteKarat(req.params.karatId);

    if (!deleted) {
      return res.status(404).json({ error: 'Karat not found' });
    }

    res.json({ message: 'Karat deleted successfully' });
  } catch (error) {
    console.error('Delete karat error:', error);

    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'Cannot delete karat with associated products'
      });
    }

    res.status(500).json({ error: 'Failed to delete karat' });
  }
});

// POST /api/materials/update-prices - Update all karat prices based on base prices (staff only)
router.post('/update-prices', authenticateToken, requireStaff, [
  body('goldPrice').isFloat({ min: 0 }).withMessage('Gold price must be a positive number'),
  body('silverPrice').isFloat({ min: 0 }).withMessage('Silver price must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { goldPrice, silverPrice } = req.body;
    const updatedCount = await MaterialService.updateAllKaratPrices(goldPrice, silverPrice);

    res.json({
      message: 'All karat prices updated successfully',
      updatedCount,
      goldPrice,
      silverPrice
    });
  } catch (error) {
    console.error('Update karat prices error:', error);
    res.status(500).json({ error: 'Failed to update karat prices' });
  }
});

export default router;