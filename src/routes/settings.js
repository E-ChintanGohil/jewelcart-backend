import express from 'express';
import { body, validationResult } from 'express-validator';
import { executeQuery } from '../config/database.js';
import { authenticateToken, requireStaff } from '../middleware/auth.js';
import EmailService from '../services/emailService.js';

const router = express.Router();

// GET /api/settings - Get site settings
router.get('/', async (req, res) => {
  try {
    const settings = await executeQuery('SELECT * FROM settings LIMIT 1');

    if (settings.length === 0) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    // Parse JSON fields
    const setting = settings[0];
    if (setting.payment_methods) {
      setting.payment_methods = JSON.parse(setting.payment_methods);
    }

    res.json({ settings: setting });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings - Update site settings (staff only)
router.put('/', authenticateToken, requireStaff, [
  body('siteName').optional().trim().isLength({ min: 1 }).withMessage('Site name cannot be empty'),
  body('siteDescription').optional().trim(),
  body('logo').optional({ values: 'falsy' }).isURL().withMessage('Logo must be a valid URL'),
  body('contactEmail').optional().isEmail().withMessage('Valid email is required'),
  body('contactPhone').optional().trim(),
  body('contactAddress').optional().trim(),
  body('goldPrice').optional().isFloat({ min: 0 }).withMessage('Gold price must be positive'),
  body('silverPrice').optional().isFloat({ min: 0 }).withMessage('Silver price must be positive'),
  body('taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  body('shippingRate').optional().isFloat({ min: 0 }).withMessage('Shipping rate must be positive'),
  body('freeShippingThreshold').optional().isFloat({ min: 0 }).withMessage('Free shipping threshold must be positive'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('paymentMethods').optional().isArray().withMessage('Payment methods must be an array'),
  body('smtpHost').optional({ values: 'falsy' }).trim(),
  body('smtpPort').optional().isInt({ min: 1, max: 65535 }).withMessage('SMTP port must be between 1 and 65535'),
  body('smtpUser').optional({ values: 'falsy' }).trim(),
  body('smtpPassword').optional({ values: 'falsy' }).trim(),
  body('smtpFromEmail').optional({ values: 'falsy' }).isEmail().withMessage('SMTP from email must be valid'),
  body('smtpFromName').optional({ values: 'falsy' }).trim(),
  body('smtpSecure').optional().isBoolean().withMessage('SMTP secure must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      siteName, siteDescription, logo, contactEmail, contactPhone, contactAddress,
      goldPrice, silverPrice, taxRate, shippingRate, freeShippingThreshold,
      currency, paymentMethods,
      smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromEmail, smtpFromName, smtpSecure
    } = req.body;

    const setClause = [];
    const values = [];

    const fieldsToUpdate = {
      site_name: siteName,
      site_description: siteDescription,
      logo,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      contact_address: contactAddress,
      gold_price: goldPrice,
      silver_price: silverPrice,
      tax_rate: taxRate,
      shipping_rate: shippingRate,
      free_shipping_threshold: freeShippingThreshold,
      currency,
      payment_methods: paymentMethods ? JSON.stringify(paymentMethods) : undefined,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_user: smtpUser,
      smtp_password: smtpPassword,
      smtp_from_email: smtpFromEmail,
      smtp_from_name: smtpFromName,
      smtp_secure: smtpSecure !== undefined ? (smtpSecure ? 1 : 0) : undefined
    };

    Object.entries(fieldsToUpdate).forEach(([key, value]) => {
      if (value !== undefined) {
        setClause.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await executeQuery(
      `UPDATE settings SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    // Invalidate email service cache so it picks up new SMTP settings
    const hasSmtpChange = smtpHost !== undefined || smtpPort !== undefined || smtpUser !== undefined ||
      smtpPassword !== undefined || smtpFromEmail !== undefined || smtpFromName !== undefined || smtpSecure !== undefined;
    if (hasSmtpChange) {
      EmailService.invalidateCache();
    }

    // Note: Product prices are calculated at runtime (base_price + karat.price_per_gram × weight).
    // When gold/silver base prices change, the frontend calls /api/materials/update-prices
    // which updates karat price_per_gram values — no product table update needed.

    const settings = await executeQuery('SELECT * FROM settings LIMIT 1');
    const setting = settings[0];
    if (setting.payment_methods) {
      setting.payment_methods = JSON.parse(setting.payment_methods);
    }

    res.json({
      message: 'Settings updated successfully',
      settings: setting
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// POST /api/settings/test-email - Send a test email (staff only)
router.post('/test-email', authenticateToken, requireStaff, async (req, res) => {
  try {
    // Get the logged-in user's email
    const users = await executeQuery('SELECT email FROM users WHERE id = ?', [req.user.userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const toEmail = users[0].email;
    await EmailService.sendTestEmail(toEmail);

    res.json({ message: `Test email sent successfully to ${toEmail}` });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(400).json({ error: error.message || 'Failed to send test email' });
  }
});

export default router;
