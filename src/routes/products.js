import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ProductService from '../services/productService.js';
import { authenticateToken, requireStaff, optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for image uploads
const uploadsDir = path.join(__dirname, '../../uploads/products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Validation middleware
const validateProduct = [
  body('name').trim().isLength({ min: 1 }).withMessage('Product name is required'),
  body('description').optional().trim(),
  body('basePrice').isFloat({ min: 0 }).withMessage('Base price must be a positive number'),
  body('categoryId').isInt({ min: 1 }).withMessage('Valid category ID is required'),
  body('materialId').isInt({ min: 1 }).withMessage('Valid material ID is required'),
  body('karatId').isInt({ min: 1 }).withMessage('Valid karat ID is required'),
  body('weight').isFloat({ min: 0.01 }).withMessage('Weight must be greater than 0'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  // SKU is auto-generated, so not required in validation
  body('images').optional().isArray().withMessage('Images must be an array'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
];

const validateProductUpdate = [
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Product name cannot be empty'),
  body('basePrice').optional().isFloat({ min: 0 }).withMessage('Base price must be a positive number'),
  body('categoryId').optional().isInt({ min: 1 }).withMessage('Valid category ID is required'),
  body('materialId').optional().isInt({ min: 1 }).withMessage('Valid material ID is required'),
  body('karatId').optional().isInt({ min: 1 }).withMessage('Valid karat ID is required'),
  body('weight').optional().isFloat({ min: 0.01 }).withMessage('Weight must be greater than 0'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('images').optional().isArray().withMessage('Images must be an array'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
];

// GET /api/products - Get all products (public with optional auth)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      category, category_id, collection, material_type, featured,
      search, min_price, max_price, sort_by, sort_order,
      page = 1, limit = 20, low_stock
    } = req.query;

    const filters = {
      is_active: true // Only show active products for public
    };

    if (category) filters.category = category;
    if (category_id) filters.category_id = category_id;
    if (collection) filters.collection = collection;
    if (material_type) filters.material_type = material_type;
    if (featured !== undefined) filters.featured = featured === 'true';
    if (search) filters.search = search;
    if (min_price) filters.min_price = parseFloat(min_price);
    if (max_price) filters.max_price = parseFloat(max_price);
    if (sort_by) filters.sort_by = sort_by;
    if (sort_order) filters.sort_order = sort_order;
    if (low_stock && req.user) filters.low_stock = true; // Only for authenticated users

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    filters.limit = limitNum;
    filters.offset = (pageNum - 1) * limitNum;

    const products = await ProductService.getAll(filters);

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        hasMore: products.length === limitNum
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/admin - Get all products for admin (includes inactive)
router.get('/admin', authenticateToken, requireStaff, async (req, res) => {
  try {
    const {
      category, category_id, collection, material_type, featured, is_active,
      search, min_price, max_price, sort_by, sort_order,
      page = 1, limit = 20, low_stock
    } = req.query;

    const filters = {};

    if (category) filters.category = category;
    if (category_id) filters.category_id = category_id;
    if (collection) filters.collection = collection;
    if (material_type) filters.material_type = material_type;
    if (featured !== undefined) filters.featured = featured === 'true';
    if (is_active !== undefined) filters.is_active = is_active === 'true';
    if (search) filters.search = search;
    if (min_price) filters.min_price = parseFloat(min_price);
    if (max_price) filters.max_price = parseFloat(max_price);
    if (sort_by) filters.sort_by = sort_by;
    if (sort_order) filters.sort_order = sort_order;
    if (low_stock) filters.low_stock = true;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    filters.limit = limitNum;
    filters.offset = (pageNum - 1) * limitNum;

    const products = await ProductService.getAll(filters);

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        hasMore: products.length === limitNum
      }
    });
  } catch (error) {
    console.error('Get admin products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/stats - Get product statistics (staff only)
router.get('/stats', authenticateToken, requireStaff, async (req, res) => {
  try {
    const stats = await ProductService.getStats();
    res.json({ stats });
  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({ error: 'Failed to fetch product statistics' });
  }
});

// GET /api/products/:id - Get single product by ID
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Valid product ID is required')
], optionalAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const product = await ProductService.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Hide inactive products from public users
    if (!product.is_active && !req.user) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products - Create new product (staff only)
router.post('/', authenticateToken, requireStaff, validateProduct, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const product = await ProductService.create(req.body);
    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Product with this SKU already exists' });
    }

    res.status(500).json({ error: 'Failed to create product' });
  }
});

// POST /api/products/with-images - Create new product with images (staff only)
router.post('/with-images', authenticateToken, requireStaff, (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File too large',
          message: 'One or more images exceed the 5MB size limit. Please compress your images and try again.',
          userFriendly: true
        });
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          error: 'Too many files',
          message: 'You can only upload up to 5 images per product.',
          userFriendly: true
        });
      }
      return res.status(400).json({
        error: 'Upload error',
        message: err.message || 'An error occurred while uploading images.',
        userFriendly: true
      });
    } else if (err) {
      if (err.message === 'Only image files are allowed') {
        return res.status(400).json({
          error: 'Invalid file type',
          message: 'Only image files (JPEG, PNG, GIF, WebP) are allowed. Please select valid image files.',
          userFriendly: true
        });
      }
      return res.status(400).json({
        error: 'Upload error',
        message: err.message || 'An error occurred during file upload.',
        userFriendly: true
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    // Parse product data from multipart form
    const productData = {
      name: req.body.name,
      description: req.body.description,
      basePrice: parseFloat(req.body.basePrice),
      categoryId: parseInt(req.body.categoryId),
      materialId: parseInt(req.body.materialId),
      karatId: parseInt(req.body.karatId),
      weight: parseFloat(req.body.weight),
      gemstone: req.body.gemstone || undefined,
      certification: req.body.certification || undefined,
      stock: parseInt(req.body.stock),
      featured: req.body.featured === 'true',
      isActive: req.body.isActive !== 'false', // Default to true
      tags: req.body.tags ? JSON.parse(req.body.tags) : []
    };

    // Validate required fields
    if (!productData.name || !productData.basePrice || !productData.categoryId ||
        !productData.materialId || !productData.karatId || !productData.weight ||
        productData.stock === undefined) {
      // Clean up uploaded files if validation fails
      if (req.files) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return res.status(400).json({ error: 'Missing required product fields' });
    }

    // Generate image URLs from uploaded files
    const imageUrls = req.files ? req.files.map(file => `/uploads/products/${file.filename}`) : [];

    // Create product with images in ProductService
    const product = await ProductService.createWithImages(productData, imageUrls);

    res.status(201).json({
      message: 'Product created successfully with images',
      product
    });
  } catch (error) {
    console.error('Create product with images error:', error);

    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    // User-friendly error messages
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Duplicate SKU',
        message: 'A product with this SKU already exists. SKUs are auto-generated, please try again.',
        userFriendly: true
      });
    }

    // Database/validation errors from Prisma
    if (error.code && error.code.startsWith('P')) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid data provided. Please check your input and try again.',
        userFriendly: true,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Generic server error
    res.status(500).json({
      error: 'Server error',
      message: 'An unexpected error occurred while creating the product. Please try again. If the problem persists, contact support.',
      userFriendly: false,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /api/products/:id - Update product (staff only)
router.put('/:id', authenticateToken, requireStaff, (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File too large',
          message: 'One or more images exceed the 5MB size limit. Please compress your images and try again.',
          userFriendly: true
        });
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          error: 'Too many files',
          message: 'You can only upload up to 5 images per product.',
          userFriendly: true
        });
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: 'Unexpected file',
          message: 'Unexpected file field in upload. Please only upload images.',
          userFriendly: true
        });
      }
      // Other multer errors
      return res.status(400).json({
        error: 'Upload error',
        message: err.message || 'An error occurred while uploading images.',
        userFriendly: true
      });
    } else if (err) {
      // File type validation error
      if (err.message === 'Only image files are allowed') {
        return res.status(400).json({
          error: 'Invalid file type',
          message: 'Only image files (JPEG, PNG, GIF, WebP) are allowed. Please select valid image files.',
          userFriendly: true
        });
      }
      // Other errors
      return res.status(400).json({
        error: 'Upload error',
        message: err.message || 'An error occurred during file upload.',
        userFriendly: true
      });
    }
    // No error, proceed
    next();
  });
}, async (req, res) => {
  try {
    const { id } = req.params;

    // Check content type to determine if this is multipart or JSON
    const isMultipart = req.is('multipart/form-data');

    let productData;
    let imageUrls = [];

    if (isMultipart) {
      // Parse product data from multipart form
      productData = {
        name: req.body.name,
        description: req.body.description,
        basePrice: req.body.basePrice ? parseFloat(req.body.basePrice) : undefined,
        categoryId: req.body.categoryId ? parseInt(req.body.categoryId) : undefined,
        materialId: req.body.materialId ? parseInt(req.body.materialId) : undefined,
        karatId: req.body.karatId ? parseInt(req.body.karatId) : undefined,
        weight: req.body.weight ? parseFloat(req.body.weight) : undefined,
        gemstone: req.body.gemstone || undefined,
        certification: req.body.certification || undefined,
        stock: req.body.stock ? parseInt(req.body.stock) : undefined,
        featured: req.body.featured === 'true',
        isActive: req.body.isActive !== 'false',
        tags: req.body.tags ? JSON.parse(req.body.tags) : undefined
      };

      // Get existing images if user wants to keep them
      let existingImages = [];
      if (req.body.keepExistingImages === 'true') {
        const existingProduct = await ProductService.findById(id);
        existingImages = existingProduct.images || [];
      }

      // Parse images to delete if provided
      let imagesToDelete = [];
      if (req.body.imagesToDelete) {
        try {
          imagesToDelete = JSON.parse(req.body.imagesToDelete);
        } catch (e) {
          console.error('Error parsing imagesToDelete:', e);
        }
      }

      // Filter out images marked for deletion
      if (imagesToDelete.length > 0) {
        existingImages = existingImages.filter(img => !imagesToDelete.includes(img.imageUrl));
      }

      // Generate new image URLs from uploaded files
      const newImageUrls = req.files && req.files.length > 0
        ? req.files.map(file => `/uploads/products/${file.filename}`)
        : [];

      // If we have new images or need to keep existing ones or changing primary
      if (existingImages.length > 0 || newImageUrls.length > 0 || req.body.primaryImageUrl) {
        // Preserve existing images with their properties
        imageUrls = [...existingImages.map(img => img.imageUrl), ...newImageUrls];

        // Pass both image URLs and existing image metadata for proper handling
        productData.images = imageUrls;
        productData.existingImageData = existingImages; // Pass full image objects
        productData.primaryImageUrl = req.body.primaryImageUrl || null; // Pass primary image selection
      }
    } else {
      // JSON request
      productData = req.body;
    }

    const product = await ProductService.update(id, productData);
    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);

    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    // User-friendly error messages
    if (error.message === 'Product not found') {
      return res.status(404).json({
        error: 'Product not found',
        message: 'The product you are trying to update does not exist.',
        userFriendly: true
      });
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Duplicate SKU',
        message: 'A product with this SKU already exists. Please use a different SKU.',
        userFriendly: true
      });
    }

    // Database/validation errors from Prisma
    if (error.code && error.code.startsWith('P')) {
      // Prisma error codes start with P
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid data provided. Please check your input and try again.',
        userFriendly: true,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Generic server error
    res.status(500).json({
      error: 'Server error',
      message: 'An unexpected error occurred. Please try again. If the problem persists, contact support.',
      userFriendly: false,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /api/products/:id - Delete product (staff only)
router.delete('/:id', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid product ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const deleted = await ProductService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// PUT /api/products/:id/stock - Update product stock (staff only)
router.put('/:id/stock', authenticateToken, requireStaff, [
  param('id').isInt({ min: 1 }).withMessage('Valid product ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('operation').isIn(['increase', 'decrease']).withMessage('Operation must be increase or decrease')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { quantity, operation } = req.body;
    const newStock = await ProductService.updateStock(req.params.id, quantity, operation);

    res.json({
      message: 'Stock updated successfully',
      newStock
    });
  } catch (error) {
    console.error('Update stock error:', error);

    if (error.message === 'Product not found') {
      return res.status(404).json({ error: error.message });
    }

    if (error.message === 'Insufficient stock') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to update stock' });
  }
});

// POST /api/products/update-prices - Update all product prices (staff only)
router.post('/update-prices', authenticateToken, requireStaff, async (req, res) => {
  try {
    const updatedCount = await ProductService.updateAllPrices();
    res.json({
      message: 'Prices updated successfully',
      updatedCount
    });
  } catch (error) {
    console.error('Update prices error:', error);
    res.status(500).json({ error: 'Failed to update prices' });
  }
});

export default router;