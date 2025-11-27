import express from 'express';
import { body, param, validationResult } from 'express-validator';
import CategoryService from '../services/categoryService.js';
import { authenticateToken, requireStaff } from '../middleware/auth.js';

const router = express.Router();

// GET /api/categories - Get all categories
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    const filters = {};
    if (status) {
      filters.status = status.toUpperCase();
    } else {
      filters.status = 'ACTIVE'; // Only active by default for public
    }

    const categories = await CategoryService.getAll(filters);
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/categories/:id - Get single category
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Valid category ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const category = await CategoryService.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ category });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST /api/categories - Create new category (staff only)
router.post('/', authenticateToken, requireStaff, [
  body('name').trim().isLength({ min: 1 }).withMessage('Category name is required'),
  body('description').optional().trim(),
  body('imageUrl').optional().isURL().withMessage('Image URL must be valid'),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE']).withMessage('Invalid status'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, description, imageUrl, status = 'ACTIVE', sortOrder = 0 } = req.body;

    const category = await CategoryService.create({
      name,
      description,
      imageUrl,
      status,
      sortOrder
    });

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    console.error('Create category error:', error);

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Category with this name already exists' });
    }

    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Update category (staff only)
router.put('/:id', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid category ID is required'),
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Category name cannot be empty'),
  body('description').optional().trim(),
  body('imageUrl').optional().isURL().withMessage('Image URL must be valid'),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE']).withMessage('Invalid status'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, description, imageUrl, status, sortOrder } = req.body;

    const category = await CategoryService.update(req.params.id, {
      name,
      description,
      imageUrl,
      status,
      sortOrder
    });

    res.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    console.error('Update category error:', error);

    if (error.message === 'Category not found') {
      return res.status(404).json({ error: error.message });
    }

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Category with this name already exists' });
    }

    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Delete category (staff only)
router.delete('/:id', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid category ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const deleted = await CategoryService.delete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);

    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'Cannot delete category with associated products'
      });
    }

    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;