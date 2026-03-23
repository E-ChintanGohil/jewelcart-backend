import express from 'express';
import { body, validationResult } from 'express-validator';
import { executeQuery } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/user-preferences - Get current user's preferences
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const preferences = await executeQuery(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [userId]
    );

    // If no preferences exist, create default ones
    if (preferences.length === 0) {
      await executeQuery(
        `INSERT INTO user_preferences (user_id, updated_at) VALUES (?, NOW())`,
        [userId]
      );

      const newPreferences = await executeQuery(
        'SELECT * FROM user_preferences WHERE user_id = ?',
        [userId]
      );

      return res.json({
        preferences: formatPreferences(newPreferences[0])
      });
    }

    res.json({
      preferences: formatPreferences(preferences[0])
    });
  } catch (error) {
    console.error('Get user preferences error:', error);
    res.status(500).json({ error: 'Failed to fetch user preferences' });
  }
});

// PUT /api/user-preferences - Update current user's preferences
router.put('/', authenticateToken, [
  body('notifications.email').optional().isBoolean(),
  body('notifications.sms').optional().isBoolean(),
  body('notifications.orderUpdates').optional().isBoolean(),
  body('notifications.promotions').optional().isBoolean(),
  body('security.twoFactor').optional().isBoolean(),
  body('security.sessionTimeout').optional().isInt({ min: 5, max: 480 }).withMessage('Session timeout must be between 5 and 480 minutes'),
  body('preferences.theme').optional().isIn(['light', 'dark']).withMessage('Theme must be light or dark'),
  body('preferences.language').optional().isLength({ min: 2, max: 10 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { notifications, security, preferences } = req.body;

    const setClause = [];
    const values = [];

    // Build dynamic update query
    if (notifications) {
      if (notifications.email !== undefined) {
        setClause.push('notifications_email = ?');
        values.push(notifications.email);
      }
      if (notifications.sms !== undefined) {
        setClause.push('notifications_sms = ?');
        values.push(notifications.sms);
      }
      if (notifications.orderUpdates !== undefined) {
        setClause.push('notifications_order_updates = ?');
        values.push(notifications.orderUpdates);
      }
      if (notifications.promotions !== undefined) {
        setClause.push('notifications_promotions = ?');
        values.push(notifications.promotions);
      }
    }

    if (security) {
      if (security.twoFactor !== undefined) {
        setClause.push('security_two_factor = ?');
        values.push(security.twoFactor);
      }
      if (security.sessionTimeout !== undefined) {
        setClause.push('security_session_timeout = ?');
        values.push(security.sessionTimeout);
      }
    }

    if (preferences) {
      if (preferences.theme) {
        setClause.push('preferences_theme = ?');
        values.push(preferences.theme);
      }
      if (preferences.language) {
        setClause.push('preferences_language = ?');
        values.push(preferences.language);
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);

    // Update preferences
    const result = await executeQuery(
      `UPDATE user_preferences SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User preferences not found' });
    }

    // Fetch updated preferences
    const updatedPreferences = await executeQuery(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [userId]
    );

    res.json({
      message: 'User preferences updated successfully',
      preferences: formatPreferences(updatedPreferences[0])
    });
  } catch (error) {
    console.error('Update user preferences error:', error);
    res.status(500).json({ error: 'Failed to update user preferences' });
  }
});

// Helper function to format preferences for frontend
function formatPreferences(dbPreferences) {
  return {
    notifications: {
      email: Boolean(dbPreferences.notifications_email),
      sms: Boolean(dbPreferences.notifications_sms),
      orderUpdates: Boolean(dbPreferences.notifications_order_updates),
      promotions: Boolean(dbPreferences.notifications_promotions)
    },
    security: {
      twoFactor: Boolean(dbPreferences.security_two_factor),
      sessionTimeout: String(dbPreferences.security_session_timeout)
    },
    preferences: {
      theme: dbPreferences.preferences_theme || 'light',
      language: dbPreferences.preferences_language || 'en'
    }
  };
}

export default router;
