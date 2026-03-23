import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../config/prisma.js';
import { authenticateToken, requireStaff } from '../middleware/auth.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${extension}`);
  }
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter
});

// Upload single product image
router.post('/product/:productId', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { productId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: parseInt(productId) }
    });

    if (!product) {
      // Delete uploaded file if product doesn't exist
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Product not found' });
    }

    // Generate image URL
    const imageUrl = `/uploads/products/${req.file.filename}`;

    // Check if product already has images
    const existingImages = await prisma.productImage.findMany({
      where: { productId: parseInt(productId) }
    });

    // Check if maximum images limit (5) is reached
    if (existingImages.length >= 5) {
      // Delete uploaded file since we can't use it
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'Maximum image limit reached',
        message: 'Product can have maximum 5 images. Please delete an existing image before uploading a new one.'
      });
    }

    // Create new product image entry
    // New image is primary only if there are no existing images
    await prisma.productImage.create({
      data: {
        productId: parseInt(productId),
        imageUrl: imageUrl,
        sortOrder: existingImages.length,
        isPrimary: existingImages.length === 0 // Only first image is primary
      }
    });

    // Get updated product with images
    const updatedProduct = await prisma.product.findUnique({
      where: { id: parseInt(productId) },
      include: {
        images: { orderBy: { sortOrder: 'asc' } }
      }
    });

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: imageUrl,
      product: updatedProduct
    });

  } catch (error) {
    console.error('Upload error:', error);

    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Failed to upload image',
      details: error.message
    });
  }
});

// Upload multiple product images
router.post('/product/:productId/multiple', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    const { productId } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: parseInt(productId) }
    });

    if (!product) {
      // Delete uploaded files if product doesn't exist
      req.files.forEach(file => {
        fs.unlinkSync(file.path);
      });
      return res.status(404).json({ error: 'Product not found' });
    }

    // Generate image URLs
    const imageUrls = req.files.map(file => `/uploads/products/${file.filename}`);

    // Get existing images count for sort order
    const existingImages = await prisma.productImage.findMany({
      where: { productId: parseInt(productId) }
    });

    // If there are existing images, set them as non-primary
    if (existingImages.length > 0) {
      await prisma.productImage.updateMany({
        where: { productId: parseInt(productId) },
        data: { isPrimary: false }
      });
    }

    // Create product image entries for all uploaded files
    const imageEntries = imageUrls.map((url, index) => ({
      productId: parseInt(productId),
      imageUrl: url,
      sortOrder: existingImages.length + index,
      isPrimary: index === 0 && existingImages.length === 0 // First image is primary if no existing images
    }));

    await prisma.productImage.createMany({
      data: imageEntries
    });

    // Get updated product with images
    const updatedProduct = await prisma.product.findUnique({
      where: { id: parseInt(productId) },
      include: {
        images: { orderBy: { sortOrder: 'asc' } }
      }
    });

    res.json({
      success: true,
      message: 'Images uploaded successfully',
      imageUrls: imageUrls,
      product: updatedProduct
    });

  } catch (error) {
    console.error('Upload error:', error);

    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    res.status(500).json({
      error: 'Failed to upload images',
      details: error.message
    });
  }
});

// Delete product image
router.delete('/product/:productId/image', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { imageUrl } = req.body;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: parseInt(productId) }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Extract filename from URL
    const filename = path.basename(imageUrl);
    const filePath = path.join(uploadsDir, filename);

    // Delete file from filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete image from database
    await prisma.productImage.deleteMany({
      where: {
        productId: parseInt(productId),
        imageUrl: imageUrl
      }
    });

    // If the deleted image was primary, make the first remaining image primary
    const remainingImages = await prisma.productImage.findMany({
      where: { productId: parseInt(productId) },
      orderBy: { sortOrder: 'asc' }
    });

    if (remainingImages.length > 0) {
      const hasPrimary = remainingImages.some(img => img.isPrimary);
      if (!hasPrimary) {
        await prisma.productImage.update({
          where: { id: remainingImages[0].id },
          data: { isPrimary: true }
        });
      }
    }

    // Get updated product with images
    const updatedProduct = await prisma.product.findUnique({
      where: { id: parseInt(productId) },
      include: {
        images: { orderBy: { sortOrder: 'asc' } }
      }
    });

    res.json({
      success: true,
      message: 'Image deleted successfully',
      product: updatedProduct
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      error: 'Failed to delete image',
      details: error.message
    });
  }
});

// Set image as primary
router.put('/product/:productId/image/primary', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: parseInt(productId) }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if image exists for this product
    const image = await prisma.productImage.findFirst({
      where: {
        productId: parseInt(productId),
        imageUrl: imageUrl
      }
    });

    if (!image) {
      return res.status(404).json({ error: 'Image not found for this product' });
    }

    // Set all images as non-primary
    await prisma.productImage.updateMany({
      where: { productId: parseInt(productId) },
      data: { isPrimary: false }
    });

    // Set the specified image as primary
    await prisma.productImage.update({
      where: { id: image.id },
      data: { isPrimary: true }
    });

    // Get updated product with images
    const updatedProduct = await prisma.product.findUnique({
      where: { id: parseInt(productId) },
      include: {
        images: { orderBy: { sortOrder: 'asc' } }
      }
    });

    res.json({
      success: true,
      message: 'Primary image updated successfully',
      product: updatedProduct
    });

  } catch (error) {
    console.error('Set primary image error:', error);
    res.status(500).json({
      error: 'Failed to set primary image',
      details: error.message
    });
  }
});

// General purpose image upload (for content, etc.)
const generalUploadsDir = path.join(__dirname, '../../uploads/general');
if (!fs.existsSync(generalUploadsDir)) {
  fs.mkdirSync(generalUploadsDir, { recursive: true });
}

const generalStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, generalUploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `upload-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const generalUpload = multer({
  storage: generalStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

router.post('/general', authenticateToken, requireStaff, generalUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const imageUrl = `/uploads/general/${req.file.filename}`;
    res.json({ success: true, imageUrl });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

export default router;