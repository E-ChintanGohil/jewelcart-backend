import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';

class UserService {
  static async findByEmail(email) {
    try {
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        password_hash: user.passwordHash,
        passwordHash: user.passwordHash,
        first_name: user.firstName,
        firstName: user.firstName,
        last_name: user.lastName,
        lastName: user.lastName,
        role: user.role,
        is_active: user.isActive,
        isActive: user.isActive,
        last_login: user.lastLogin,
        lastLogin: user.lastLogin,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
    } catch (error) {
      console.error('Find user by email error:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: parseInt(id) }
      });

      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        password_hash: user.passwordHash,
        passwordHash: user.passwordHash,
        first_name: user.firstName,
        firstName: user.firstName,
        last_name: user.lastName,
        lastName: user.lastName,
        role: user.role,
        is_active: user.isActive,
        isActive: user.isActive,
        last_login: user.lastLogin,
        lastLogin: user.lastLogin,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
    } catch (error) {
      console.error('Find user by ID error:', error);
      throw error;
    }
  }

  static async verifyPassword(user, password) {
    try {
      return await bcrypt.compare(password, user.passwordHash || user.password_hash);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  static async create(userData) {
    try {
      const { email, password, firstName, lastName, role = 'STAFF' } = userData;

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role
        }
      });

      return {
        id: user.id,
        email: user.email,
        first_name: user.firstName,
        firstName: user.firstName,
        last_name: user.lastName,
        lastName: user.lastName,
        role: user.role,
        is_active: user.isActive,
        isActive: user.isActive,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
    } catch (error) {
      console.error('Create user error:', error);
      throw error;
    }
  }

  static async updateLastLogin(userId) {
    try {
      await prisma.user.update({
        where: { id: parseInt(userId) },
        data: { lastLogin: new Date() }
      });
    } catch (error) {
      console.error('Update last login error:', error);
      // Don't throw error for login tracking failure
    }
  }

  static async getAll(filters = {}) {
    try {
      const where = {};

      if (filters.role) {
        where.role = filters.role;
      }

      if (filters.is_active !== undefined) {
        where.isActive = filters.is_active;
      }

      const users = await prisma.user.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return users.map(user => ({
        id: user.id,
        email: user.email,
        first_name: user.firstName,
        firstName: user.firstName,
        last_name: user.lastName,
        lastName: user.lastName,
        role: user.role,
        is_active: user.isActive,
        isActive: user.isActive,
        last_login: user.lastLogin,
        lastLogin: user.lastLogin,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }));
    } catch (error) {
      console.error('Get all users error:', error);
      throw error;
    }
  }

  static async update(id, updates) {
    try {
      const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
      if (!user) {
        throw new Error('User not found');
      }

      const { email, firstName, lastName, role, isActive, password } = updates;

      const updateData = {};
      if (email !== undefined) updateData.email = email;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (role !== undefined) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;

      // Hash new password if provided
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id: parseInt(id) },
        data: updateData,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return {
        id: updatedUser.id,
        email: updatedUser.email,
        first_name: updatedUser.firstName,
        firstName: updatedUser.firstName,
        last_name: updatedUser.lastName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        is_active: updatedUser.isActive,
        isActive: updatedUser.isActive,
        last_login: updatedUser.lastLogin,
        lastLogin: updatedUser.lastLogin,
        created_at: updatedUser.createdAt,
        updated_at: updatedUser.updatedAt,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      };
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await prisma.user.delete({
        where: { id: parseInt(id) }
      });
      return !!result;
    } catch (error) {
      if (error.code === 'P2025') {
        return false; // Record not found
      }
      console.error('Delete user error:', error);
      throw error;
    }
  }
}

export default UserService;