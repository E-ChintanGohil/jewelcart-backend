import prisma from '../config/prisma.js';

class CategoryService {
  static async getAll(filters = {}) {
    try {
      const where = {};

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search } },
          { description: { contains: filters.search } }
        ];
      }

      const categories = await prisma.category.findMany({
        where,
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' }
        ]
      });

      return categories.map(category => ({
        id: category.id,
        name: category.name,
        description: category.description,
        image_url: category.imageUrl,
        imageUrl: category.imageUrl,
        status: category.status,
        sort_order: category.sortOrder,
        sortOrder: category.sortOrder,
        created_at: category.createdAt,
        updated_at: category.updatedAt,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      }));
    } catch (error) {
      console.error('Get categories error:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const category = await prisma.category.findUnique({
        where: { id: parseInt(id) }
      });

      if (!category) return null;

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        image_url: category.imageUrl,
        imageUrl: category.imageUrl,
        status: category.status,
        sort_order: category.sortOrder,
        sortOrder: category.sortOrder,
        created_at: category.createdAt,
        updated_at: category.updatedAt,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      };
    } catch (error) {
      console.error('Find category by ID error:', error);
      throw error;
    }
  }

  static async create(categoryData) {
    try {
      const { name, description, imageUrl, status = 'ACTIVE', sortOrder = 0 } = categoryData;

      const category = await prisma.category.create({
        data: {
          name,
          description,
          imageUrl,
          status,
          sortOrder: parseInt(sortOrder)
        }
      });

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        image_url: category.imageUrl,
        imageUrl: category.imageUrl,
        status: category.status,
        sort_order: category.sortOrder,
        sortOrder: category.sortOrder,
        created_at: category.createdAt,
        updated_at: category.updatedAt,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      };
    } catch (error) {
      console.error('Create category error:', error);
      throw error;
    }
  }

  static async update(id, updates) {
    try {
      const category = await prisma.category.findUnique({ where: { id: parseInt(id) } });
      if (!category) {
        throw new Error('Category not found');
      }

      const { name, description, imageUrl, status, sortOrder } = updates;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
      if (status !== undefined) updateData.status = status;
      if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder);

      const updatedCategory = await prisma.category.update({
        where: { id: parseInt(id) },
        data: updateData
      });

      return {
        id: updatedCategory.id,
        name: updatedCategory.name,
        description: updatedCategory.description,
        image_url: updatedCategory.imageUrl,
        imageUrl: updatedCategory.imageUrl,
        status: updatedCategory.status,
        sort_order: updatedCategory.sortOrder,
        sortOrder: updatedCategory.sortOrder,
        created_at: updatedCategory.createdAt,
        updated_at: updatedCategory.updatedAt,
        createdAt: updatedCategory.createdAt,
        updatedAt: updatedCategory.updatedAt
      };
    } catch (error) {
      console.error('Update category error:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await prisma.category.delete({
        where: { id: parseInt(id) }
      });
      return !!result;
    } catch (error) {
      if (error.code === 'P2025') {
        return false; // Record not found
      }
      console.error('Delete category error:', error);
      throw error;
    }
  }

  static async getStats() {
    try {
      const totalCategories = await prisma.category.count();
      const activeCategories = await prisma.category.count({
        where: { status: 'ACTIVE' }
      });

      return {
        total_categories: totalCategories,
        active_categories: activeCategories
      };
    } catch (error) {
      console.error('Get category stats error:', error);
      throw error;
    }
  }
}

export default CategoryService;