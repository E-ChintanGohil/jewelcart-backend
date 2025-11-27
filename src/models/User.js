import bcrypt from 'bcryptjs';
import { executeQuery } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

class User {
  static async findByEmail(email) {
    const users = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return users[0] || null;
  }

  static async findById(id) {
    const users = await executeQuery(
      'SELECT id, email, first_name, last_name, role, last_login, created_at FROM users WHERE id = ?',
      [id]
    );
    return users[0] || null;
  }

  static async create(userData) {
    const { email, password, firstName, lastName, role = 'staff' } = userData;

    // Check if user already exists
    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const id = uuidv4();
    await executeQuery(
      `INSERT INTO users (id, email, password, first_name, last_name, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, email, hashedPassword, firstName, lastName, role]
    );

    return await this.findById(id);
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async updateLastLogin(userId) {
    await executeQuery(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
  }

  static async update(id, updates) {
    const { firstName, lastName, email, role } = updates;

    const setClause = [];
    const values = [];

    if (firstName !== undefined) {
      setClause.push('first_name = ?');
      values.push(firstName);
    }
    if (lastName !== undefined) {
      setClause.push('last_name = ?');
      values.push(lastName);
    }
    if (email !== undefined) {
      setClause.push('email = ?');
      values.push(email);
    }
    if (role !== undefined) {
      setClause.push('role = ?');
      values.push(role);
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(id);

    await executeQuery(
      `UPDATE users SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    return await this.findById(id);
  }

  static async changePassword(id, newPassword) {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await executeQuery(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, id]
    );

    return true;
  }

  static async getAll(filters = {}) {
    let query = 'SELECT id, email, first_name, last_name, role, last_login, created_at FROM users';
    const conditions = [];
    const values = [];

    if (filters.role) {
      conditions.push('role = ?');
      values.push(filters.role);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      values.push(parseInt(filters.limit));
    }

    return await executeQuery(query, values);
  }

  static async delete(id) {
    const result = await executeQuery('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async getUserStats() {
    const stats = await executeQuery(`
      SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
        SUM(CASE WHEN role = 'staff' THEN 1 ELSE 0 END) as staff_count,
        SUM(CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as active_last_30_days
      FROM users
    `);

    return stats[0];
  }
}

export default User;