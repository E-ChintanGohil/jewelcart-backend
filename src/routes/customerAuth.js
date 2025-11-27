import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import prisma from '../config/prisma.js';

const router = express.Router();

// Validation middleware
const validateCustomerLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const validateCustomerRegister = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
];

// Helper function to generate JWT for customers
const generateCustomerToken = (customerId) => {
  return jwt.sign(
    { customerId, type: 'customer' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// POST /api/customer-auth/register
router.post('/register', validateCustomerRegister, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, firstName, lastName } = req.body;

    // Check if customer already exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { email }
    });

    if (existingCustomer) {
      return res.status(409).json({ error: 'Customer with this email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        status: 'CUSTOMER'
      }
    });

    // Generate token
    const token = generateCustomerToken(customer.id);

    // Return customer data (excluding password) and token
    const { passwordHash: _, ...customerWithoutPassword } = customer;

    res.status(201).json({
      message: 'Registration successful',
      user: {
        ...customerWithoutPassword,
        role: 'customer',
        first_name: customer.firstName,
        last_name: customer.lastName
      },
      token
    });
  } catch (error) {
    console.error('Customer registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/customer-auth/login
router.post('/login', validateCustomerLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find customer by email
    const customer = await prisma.customer.findUnique({
      where: { email }
    });

    if (!customer || !customer.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, customer.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateCustomerToken(customer.id);

    // Return customer data (excluding password) and token
    const { passwordHash: _, ...customerWithoutPassword } = customer;

    res.json({
      message: 'Login successful',
      user: {
        ...customerWithoutPassword,
        role: 'customer',
        first_name: customer.firstName,
        last_name: customer.lastName
      },
      token
    });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Middleware to authenticate customer tokens
export const authenticateCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'customer') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: decoded.customerId }
    });

    if (!customer) {
      return res.status(401).json({ error: 'Customer not found' });
    }

    req.customer = customer;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /api/customer-auth/addresses
router.get('/addresses', authenticateCustomer, async (req, res) => {
  try {
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId: req.customer.id },
      orderBy: { isDefault: 'desc' }
    });
    res.json({ addresses });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

// POST /api/customer-auth/addresses
router.post('/addresses', authenticateCustomer, [
  body('name').trim().notEmpty().withMessage('Contact name is required'),
  body('street').trim().notEmpty().withMessage('Street address is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('zipCode').trim().notEmpty().withMessage('Zip code is required'),
  body('country').trim().notEmpty().withMessage('Country is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, street, city, state, zipCode, country, phone, isDefault, type } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerId: req.customer.id },
        data: { isDefault: false }
      });
    }

    // Check if this is the first address, make it default if so
    const addressCount = await prisma.customerAddress.count({
      where: { customerId: req.customer.id }
    });

    const address = await prisma.customerAddress.create({
      data: {
        customerId: req.customer.id,
        contactName: name,
        street,
        city,
        state,
        zipCode,
        country,
        phone,
        type: type || 'HOME',
        isDefault: isDefault || addressCount === 0
      }
    });

    res.status(201).json({
      message: 'Address added successfully',
      address
    });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ error: 'Failed to add address' });
  }
});

// GET /api/customer-auth/me
router.get('/me', authenticateCustomer, async (req, res) => {
  try {
    const { passwordHash: _, ...customerWithoutPassword } = req.customer;
    
    // Fetch addresses
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId: req.customer.id },
      orderBy: { isDefault: 'desc' }
    });

    res.json({
      user: {
        ...customerWithoutPassword,
        role: 'customer',
        first_name: req.customer.firstName,
        last_name: req.customer.lastName,
        addresses
      }
    });
  } catch (error) {
    console.error('Get customer profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;