import prisma from '../config/prisma.js';

class MaterialService {
  static async getAll(filters = {}) {
    try {
      const where = {};

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.is_active !== undefined) {
        where.isActive = filters.is_active;
      }

      const materials = await prisma.material.findMany({
        where,
        include: {
          karats: {
            where: {
              isActive: true
            },
            orderBy: {
              purity: 'desc'
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });

      return materials.map(material => ({
        id: material.id,
        name: material.name,
        type: material.type,
        is_active: material.isActive,
        isActive: material.isActive,
        created_at: material.createdAt,
        createdAt: material.createdAt,
        karats: material.karats.map(karat => ({
          id: karat.id,
          material_id: karat.materialId,
          materialId: karat.materialId,
          value: karat.value,
          purity: parseFloat(karat.purity),
          price_per_gram: parseFloat(karat.pricePerGram),
          pricePerGram: parseFloat(karat.pricePerGram),
          is_active: karat.isActive,
          isActive: karat.isActive,
          created_at: karat.createdAt,
          updated_at: karat.updatedAt,
          createdAt: karat.createdAt,
          updatedAt: karat.updatedAt
        }))
      }));
    } catch (error) {
      console.error('Get materials error:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const material = await prisma.material.findUnique({
        where: { id: parseInt(id) },
        include: {
          karats: {
            orderBy: {
              purity: 'desc'
            }
          }
        }
      });

      if (!material) return null;

      return {
        id: material.id,
        name: material.name,
        type: material.type,
        is_active: material.isActive,
        isActive: material.isActive,
        created_at: material.createdAt,
        createdAt: material.createdAt,
        karats: material.karats.map(karat => ({
          id: karat.id,
          material_id: karat.materialId,
          materialId: karat.materialId,
          value: karat.value,
          purity: parseFloat(karat.purity),
          price_per_gram: parseFloat(karat.pricePerGram),
          pricePerGram: parseFloat(karat.pricePerGram),
          is_active: karat.isActive,
          isActive: karat.isActive,
          created_at: karat.createdAt,
          updated_at: karat.updatedAt,
          createdAt: karat.createdAt,
          updatedAt: karat.updatedAt
        }))
      };
    } catch (error) {
      console.error('Find material by ID error:', error);
      throw error;
    }
  }

  static async create(materialData) {
    try {
      const { name, type, isActive = true } = materialData;

      const material = await prisma.material.create({
        data: {
          name,
          type,
          isActive
        }
      });

      return {
        id: material.id,
        name: material.name,
        type: material.type,
        is_active: material.isActive,
        isActive: material.isActive,
        created_at: material.createdAt,
        createdAt: material.createdAt,
        karats: []
      };
    } catch (error) {
      console.error('Create material error:', error);
      throw error;
    }
  }

  static async update(id, updates) {
    try {
      const material = await prisma.material.findUnique({ where: { id: parseInt(id) } });
      if (!material) {
        throw new Error('Material not found');
      }

      const { name, type, isActive } = updates;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (type !== undefined) updateData.type = type;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updatedMaterial = await prisma.material.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          karats: {
            orderBy: {
              purity: 'desc'
            }
          }
        }
      });

      return {
        id: updatedMaterial.id,
        name: updatedMaterial.name,
        type: updatedMaterial.type,
        is_active: updatedMaterial.isActive,
        isActive: updatedMaterial.isActive,
        created_at: updatedMaterial.createdAt,
        createdAt: updatedMaterial.createdAt,
        karats: updatedMaterial.karats.map(karat => ({
          id: karat.id,
          material_id: karat.materialId,
          materialId: karat.materialId,
          value: karat.value,
          purity: parseFloat(karat.purity),
          price_per_gram: parseFloat(karat.pricePerGram),
          pricePerGram: parseFloat(karat.pricePerGram),
          is_active: karat.isActive,
          isActive: karat.isActive,
          created_at: karat.createdAt,
          updated_at: karat.updatedAt,
          createdAt: karat.createdAt,
          updatedAt: karat.updatedAt
        }))
      };
    } catch (error) {
      console.error('Update material error:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await prisma.material.delete({
        where: { id: parseInt(id) }
      });
      return !!result;
    } catch (error) {
      if (error.code === 'P2025') {
        return false; // Record not found
      }
      console.error('Delete material error:', error);
      throw error;
    }
  }

  static async createKarat(materialId, karatData) {
    try {
      const { value, purity, pricePerGram, isActive = true } = karatData;

      const karat = await prisma.karat.create({
        data: {
          materialId: parseInt(materialId),
          value,
          purity: parseFloat(purity),
          pricePerGram: parseFloat(pricePerGram),
          isActive
        }
      });

      return {
        id: karat.id,
        material_id: karat.materialId,
        materialId: karat.materialId,
        value: karat.value,
        purity: parseFloat(karat.purity),
        price_per_gram: parseFloat(karat.pricePerGram),
        pricePerGram: parseFloat(karat.pricePerGram),
        is_active: karat.isActive,
        isActive: karat.isActive,
        created_at: karat.createdAt,
        updated_at: karat.updatedAt,
        createdAt: karat.createdAt,
        updatedAt: karat.updatedAt
      };
    } catch (error) {
      console.error('Create karat error:', error);
      throw error;
    }
  }

  static async updateKarat(karatId, updates) {
    try {
      const karat = await prisma.karat.findUnique({ where: { id: parseInt(karatId) } });
      if (!karat) {
        throw new Error('Karat not found');
      }

      const { value, purity, pricePerGram, isActive } = updates;

      const updateData = {};
      if (value !== undefined) updateData.value = value;
      if (purity !== undefined) updateData.purity = parseFloat(purity);
      if (pricePerGram !== undefined) updateData.pricePerGram = parseFloat(pricePerGram);
      if (isActive !== undefined) updateData.isActive = isActive;

      const updatedKarat = await prisma.karat.update({
        where: { id: parseInt(karatId) },
        data: updateData
      });

      return {
        id: updatedKarat.id,
        material_id: updatedKarat.materialId,
        materialId: updatedKarat.materialId,
        value: updatedKarat.value,
        purity: parseFloat(updatedKarat.purity),
        price_per_gram: parseFloat(updatedKarat.pricePerGram),
        pricePerGram: parseFloat(updatedKarat.pricePerGram),
        is_active: updatedKarat.isActive,
        isActive: updatedKarat.isActive,
        created_at: updatedKarat.createdAt,
        updated_at: updatedKarat.updatedAt,
        createdAt: updatedKarat.createdAt,
        updatedAt: updatedKarat.updatedAt
      };
    } catch (error) {
      console.error('Update karat error:', error);
      throw error;
    }
  }

  static async deleteKarat(karatId) {
    try {
      const result = await prisma.karat.delete({
        where: { id: parseInt(karatId) }
      });
      return !!result;
    } catch (error) {
      if (error.code === 'P2025') {
        return false; // Record not found
      }
      console.error('Delete karat error:', error);
      throw error;
    }
  }

  static async updateAllKaratPrices(baseGoldPrice, baseSilverPrice) {
    try {
      // Get all materials with their karats
      const materials = await prisma.material.findMany({
        include: {
          karats: true
        }
      });

      let updatedCount = 0;

      for (const material of materials) {
        const basePrice = material.type === 'GOLD' ? baseGoldPrice : baseSilverPrice;

        for (const karat of material.karats) {
          // Calculate new price based on purity
          const newPrice = Math.round(basePrice * (parseFloat(karat.purity) / 99.9));

          await prisma.karat.update({
            where: { id: karat.id },
            data: { pricePerGram: newPrice }
          });

          updatedCount++;
        }
      }

      return updatedCount;
    } catch (error) {
      console.error('Update all karat prices error:', error);
      throw error;
    }
  }
}

export default MaterialService;