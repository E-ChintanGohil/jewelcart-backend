-- ========================================
-- Migration: Add User Preferences System
-- Date: 2025-11-17
-- Description: Adds user_preferences table for per-user notification and security settings
-- ========================================

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,

    -- Notification Preferences
    notifications_email BOOLEAN DEFAULT TRUE,
    notifications_sms BOOLEAN DEFAULT FALSE,
    notifications_order_updates BOOLEAN DEFAULT TRUE,
    notifications_promotions BOOLEAN DEFAULT FALSE,

    -- Security Settings
    security_two_factor BOOLEAN DEFAULT FALSE,
    security_session_timeout INT DEFAULT 30, -- minutes

    -- UI Preferences
    preferences_theme VARCHAR(20) DEFAULT 'light',
    preferences_language VARCHAR(10) DEFAULT 'en',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key constraint
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    -- Indexes
    UNIQUE KEY unique_user_preferences (user_id),
    INDEX idx_user_id (user_id)
);

-- Insert default preferences for existing users
INSERT INTO user_preferences (user_id)
SELECT id FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM user_preferences WHERE user_preferences.user_id = users.id
);

-- ========================================
-- Rollback Instructions:
-- To rollback this migration, run:
-- DROP TABLE IF EXISTS user_preferences;
-- ========================================
