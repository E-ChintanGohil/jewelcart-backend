import prisma from '../config/prisma.js';

class SKUService {
  // Category code mapping
  static getCategoryCode(categoryName) {
    const codes = {
      'Rings': 'RG',
      'Necklaces': 'NK',
      'Earrings': 'ER',
      'Bracelets': 'BR',
      'Bangles': 'BG',
      'Pendants': 'PD',
      'Chains': 'CH',
      'Anklets': 'AN'
    };
    return codes[categoryName] || 'JW'; // Default to JW (Jewelry)
  }

  // Material code mapping
  static getMaterialCode(materialType) {
    const codes = {
      'GOLD': 'GLD',
      'SILVER': 'SLV',
      'PLATINUM': 'PLT',
      'DIAMOND': 'DMD'
    };
    return codes[materialType] || 'GEN'; // Default to GEN (General)
  }

  // Get next sequential number for the category-material combination
  static async getNextSequentialNumber(categoryCode, materialCode) {
    try {
      const prefix = `${categoryCode}-${materialCode}-`;

      // Find the highest existing SKU with this prefix
      const lastProduct = await prisma.product.findFirst({
        where: {
          sku: {
            startsWith: prefix
          }
        },
        orderBy: {
          sku: 'desc'
        }
      });

      if (!lastProduct) {
        return 1; // Start with 001
      }

      // Extract the number from the last SKU
      const lastSku = lastProduct.sku;
      const numberPart = lastSku.split('-')[2];
      const lastNumber = parseInt(numberPart) || 0;

      return lastNumber + 1;
    } catch (error) {
      console.error('Error getting next sequential number:', error);
      return 1; // Fallback to 1
    }
  }

  // Generate SKU for a product
  static async generateSKU(categoryId, materialId) {
    try {
      // Get category name
      const category = await prisma.category.findUnique({
        where: { id: parseInt(categoryId) }
      });

      if (!category) {
        throw new Error('Category not found');
      }

      // Get material type
      const material = await prisma.material.findUnique({
        where: { id: parseInt(materialId) }
      });

      if (!material) {
        throw new Error('Material not found');
      }

      const categoryCode = this.getCategoryCode(category.name);
      const materialCode = this.getMaterialCode(material.type);
      const sequentialNumber = await this.getNextSequentialNumber(categoryCode, materialCode);

      // Format with leading zeros (3 digits)
      const formattedNumber = sequentialNumber.toString().padStart(3, '0');

      return `${categoryCode}-${materialCode}-${formattedNumber}`;
    } catch (error) {
      console.error('SKU generation error:', error);
      throw error;
    }
  }

  // Check if SKU already exists
  static async skuExists(sku) {
    try {
      const product = await prisma.product.findFirst({
        where: { sku }
      });
      return !!product;
    } catch (error) {
      console.error('SKU check error:', error);
      return false;
    }
  }

  // Generate unique SKU (with fallback if conflicts occur)
  static async generateUniqueSKU(categoryId, materialId, maxAttempts = 10) {
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const sku = await this.generateSKU(categoryId, materialId);
        const exists = await this.skuExists(sku);

        if (!exists) {
          return sku;
        }

        // If SKU exists, add attempt suffix
        const uniqueSku = `${sku}-${attempt}`;
        const uniqueExists = await this.skuExists(uniqueSku);

        if (!uniqueExists) {
          return uniqueSku;
        }
      }

      // Final fallback with timestamp
      const timestamp = Date.now().toString().slice(-6);
      return `JW-GEN-${timestamp}`;
    } catch (error) {
      console.error('Unique SKU generation error:', error);
      // Ultimate fallback
      const timestamp = Date.now().toString().slice(-6);
      return `JW-GEN-${timestamp}`;
    }
  }
}

export default SKUService;