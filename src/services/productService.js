import prisma from '../config/prisma.js';
import SKUService from './skuService.js';

class ProductService {
  static async calculatePrice(materialId, karatId, weight, basePrice = 0) {
    try {
      const karat = await prisma.karat.findFirst({
        where: {
          id: karatId,
          materialId: materialId
        }
      });

      if (!karat) {
        return basePrice;
      }

      const materialCost = parseFloat(karat.pricePerGram) * parseFloat(weight);
      return Math.round(materialCost + parseFloat(basePrice));
    } catch (error) {
      console.error('Price calculation error:', error);
      return basePrice;
    }
  }

  static async findById(id) {
    try {
      const product = await prisma.product.findUnique({
        where: { id: parseInt(id) },
        include: {
          category: true,
          material: true,
          karat: true,
          images: {
            orderBy: { sortOrder: 'asc' }
          },
          tags: true
        }
      });

      if (!product) return null;

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        sku: product.sku,
        category: product.category.name,
        category_id: product.categoryId,
        category_name: product.category.name,
        material_id: product.materialId,
        material_name: product.material.name,
        material_type: product.material.type,
        karat_id: product.karatId,
        karat_value: product.karat.value,
        karat_purity: product.karat.purity,
        base_price: parseFloat(product.basePrice),
        calculated_price: await this.calculatePrice(product.materialId, product.karatId, product.weight, product.basePrice),
        weight: parseFloat(product.weight),
        gemstone: product.gemstone,
        dimensions: product.dimensions,
        certification: product.certification,
        stock: product.stockQuantity,
        stock_quantity: product.stockQuantity,
        low_stock_threshold: product.lowStockThreshold,
        featured: product.isFeatured,
        is_featured: product.isFeatured,
        is_active: product.isActive,
        isActive: product.isActive,
        images: product.images.map(img => ({
          imageUrl: img.imageUrl,
          isPrimary: img.isPrimary,
          sortOrder: img.sortOrder
        })),
        tags: product.tags.map(tag => tag.tag),
        primary_image: product.images.find(img => img.isPrimary)?.imageUrl || product.images[0]?.imageUrl,
        created_at: product.createdAt,
        updated_at: product.updatedAt,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        price: await this.calculatePrice(product.materialId, product.karatId, product.weight, product.basePrice)
      };
    } catch (error) {
      console.error('Find product by ID error:', error);
      throw error;
    }
  }

  static async getAll(filters = {}) {
    try {
      const where = {};
      const orderBy = [];

      // Build where conditions
      if (filters.category_id) {
        where.categoryId = filters.category_id;
      }

      if (filters.category) {
        where.category = {
          name: filters.category
        };
      }

      if (filters.material_type) {
        where.material = {
          type: filters.material_type
        };
      }

      if (filters.featured !== undefined) {
        where.isFeatured = filters.featured;
      }

      if (filters.is_active !== undefined) {
        where.isActive = filters.is_active;
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search } },
          { description: { contains: filters.description } },
          { sku: { contains: filters.search } }
        ];
      }

      if (filters.low_stock) {
        where.stockQuantity = { lt: 5 };
      }

      // Build orderBy
      if (filters.sort_by) {
        const sortField = filters.sort_by;
        const sortOrder = filters.sort_order === 'desc' ? 'desc' : 'asc';

        switch (sortField) {
          case 'name':
            orderBy.push({ name: sortOrder });
            break;
          case 'stock':
            orderBy.push({ stockQuantity: sortOrder });
            break;
          case 'created_at':
            orderBy.push({ createdAt: sortOrder });
            break;
          default:
            orderBy.push({ createdAt: 'desc' });
        }
      } else {
        orderBy.push({ createdAt: 'desc' });
      }

      // Pagination
      const skip = filters.offset ? parseInt(filters.offset) : undefined;
      const take = filters.limit ? parseInt(filters.limit) : undefined;

      const products = await prisma.product.findMany({
        where,
        include: {
          category: true,
          material: true,
          karat: true,
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            where: { isPrimary: true }
          },
          tags: true
        },
        orderBy,
        skip,
        take
      });

      // Transform and calculate prices for all products
      const transformedProducts = await Promise.all(
        products.map(async (product) => {
          const calculatedPrice = await this.calculatePrice(
            product.materialId,
            product.karatId,
            product.weight,
            product.basePrice
          );

          return {
            id: product.id,
            name: product.name,
            description: product.description,
            sku: product.sku,
            category: product.category.name,
            category_id: product.categoryId,
            category_name: product.category.name,
            material_id: product.materialId,
            material_name: product.material.name,
            material_type: product.material.type,
            karat_id: product.karatId,
            karat_value: product.karat.value,
            base_price: parseFloat(product.basePrice),
            calculated_price: calculatedPrice,
            price: calculatedPrice,
            weight: parseFloat(product.weight),
            gemstone: product.gemstone,
            dimensions: product.dimensions,
            certification: product.certification,
            stock: product.stockQuantity,
            stock_quantity: product.stockQuantity,
            featured: product.isFeatured,
            is_featured: product.isFeatured,
            is_active: product.isActive,
            isActive: product.isActive,
            tags: product.tags.map(tag => tag.tag),
            primary_image: product.images[0]?.imageUrl,
            created_at: product.createdAt,
            updated_at: product.updatedAt
          };
        })
      );

      // Apply price filters if specified (after calculation)
      let filteredProducts = transformedProducts;
      if (filters.min_price || filters.max_price) {
        filteredProducts = transformedProducts.filter(product => {
          if (filters.min_price && product.calculated_price < parseFloat(filters.min_price)) {
            return false;
          }
          if (filters.max_price && product.calculated_price > parseFloat(filters.max_price)) {
            return false;
          }
          return true;
        });
      }

      return filteredProducts;
    } catch (error) {
      console.error('Get all products error:', error);
      throw error;
    }
  }

  static async create(productData) {
    try {
      const {
        name, description, basePrice, categoryId, materialId, karatId,
        gemstone, weight, dimensions, stock, featured = false,
        isActive = true, certification, images = [], tags = []
      } = productData;

      // Generate SKU automatically
      const sku = await SKUService.generateUniqueSKU(categoryId, materialId);

      // Create product with related data in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the product
        const product = await tx.product.create({
          data: {
            name,
            description,
            sku,
            categoryId,
            materialId,
            karatId,
            basePrice: parseFloat(basePrice),
            weight: parseFloat(weight),
            gemstone,
            dimensions,
            certification,
            stockQuantity: parseInt(stock),
            isFeatured: featured,
            isActive
          }
        });

        // Add images
        if (images.length > 0) {
          await tx.productImage.createMany({
            data: images.map((imageUrl, index) => ({
              productId: product.id,
              imageUrl,
              sortOrder: index,
              isPrimary: index === 0
            }))
          });
        }

        // Add tags
        if (tags.length > 0) {
          await tx.productTag.createMany({
            data: tags.map(tag => ({
              productId: product.id,
              tag
            }))
          });
        }

        return product;
      });

      return await this.findById(result.id);
    } catch (error) {
      console.error('Create product error:', error);
      throw error;
    }
  }

  // Create product with images (wrapper for multipart/form-data upload)
  static async createWithImages(productData, imageUrls = []) {
    try {
      // Simply call the existing create method with images
      return await this.create({
        ...productData,
        images: imageUrls
      });
    } catch (error) {
      console.error('Create product with images error:', error);
      throw error;
    }
  }

  static async update(id, updates) {
    try {
      const product = await prisma.product.findUnique({ where: { id: parseInt(id) } });
      if (!product) {
        throw new Error('Product not found');
      }

      const {
        name, description, basePrice, categoryId, materialId, karatId,
        gemstone, weight, dimensions, stock, featured, isActive, sku,
        certification, images, tags, existingImageData, primaryImageUrl
      } = updates;

      const result = await prisma.$transaction(async (tx) => {
        // Update product
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (basePrice !== undefined) updateData.basePrice = parseFloat(basePrice);
        if (categoryId !== undefined) updateData.categoryId = categoryId;
        if (materialId !== undefined) updateData.materialId = materialId;
        if (karatId !== undefined) updateData.karatId = karatId;
        if (gemstone !== undefined) updateData.gemstone = gemstone;
        if (weight !== undefined) updateData.weight = parseFloat(weight);
        if (dimensions !== undefined) updateData.dimensions = dimensions;
        if (stock !== undefined) updateData.stockQuantity = parseInt(stock);
        if (featured !== undefined) updateData.isFeatured = featured;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (sku !== undefined) updateData.sku = sku;
        if (certification !== undefined) updateData.certification = certification;

        const updatedProduct = await tx.product.update({
          where: { id: parseInt(id) },
          data: updateData
        });

        // Update images if provided
        if (images !== undefined) {
          await tx.productImage.deleteMany({
            where: { productId: parseInt(id) }
          });

          if (images.length > 0) {
            // Create a map of existing images to preserve their isPrimary status
            const existingImageMap = new Map();
            if (existingImageData && Array.isArray(existingImageData)) {
              existingImageData.forEach(img => {
                existingImageMap.set(img.imageUrl, {
                  isPrimary: img.isPrimary,
                  sortOrder: img.sortOrder
                });
              });
            }

            await tx.productImage.createMany({
              data: images.map((imageUrl, index) => {
                const existingImage = existingImageMap.get(imageUrl);

                // Determine if this image should be primary
                let isPrimary;
                if (primaryImageUrl) {
                  // If user specified a primary image, use that
                  isPrimary = imageUrl === primaryImageUrl;
                } else if (existingImage) {
                  // Preserve existing isPrimary status
                  isPrimary = existingImage.isPrimary;
                } else {
                  // For new images, set first as primary if no existing primary
                  isPrimary = index === 0 && !existingImageMap.size;
                }

                return {
                  productId: parseInt(id),
                  imageUrl,
                  sortOrder: existingImage ? existingImage.sortOrder : (existingImageData ? existingImageData.length + index : index),
                  isPrimary
                };
              })
            });
          }
        }

        // Update tags if provided
        if (tags !== undefined) {
          await tx.productTag.deleteMany({
            where: { productId: parseInt(id) }
          });

          if (tags.length > 0) {
            await tx.productTag.createMany({
              data: tags.map(tag => ({
                productId: parseInt(id),
                tag
              }))
            });
          }
        }

        return updatedProduct;
      });

      return await this.findById(parseInt(id));
    } catch (error) {
      console.error('Update product error:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await prisma.product.delete({
        where: { id: parseInt(id) }
      });
      return !!result;
    } catch (error) {
      if (error.code === 'P2025') {
        return false; // Record not found
      }
      console.error('Delete product error:', error);
      throw error;
    }
  }

  static async updateStock(id, quantity, operation = 'decrease') {
    try {
      const product = await prisma.product.findUnique({ where: { id: parseInt(id) } });
      if (!product) {
        throw new Error('Product not found');
      }

      const newStock = operation === 'decrease'
        ? product.stockQuantity - quantity
        : product.stockQuantity + quantity;

      if (newStock < 0) {
        throw new Error('Insufficient stock');
      }

      await prisma.product.update({
        where: { id: parseInt(id) },
        data: { stockQuantity: newStock }
      });

      return newStock;
    } catch (error) {
      console.error('Update stock error:', error);
      throw error;
    }
  }

  static async getStats() {
    try {
      const totalProducts = await prisma.product.count();
      const lowStockCount = await prisma.product.count({
        where: { stockQuantity: { lt: 5 } }
      });
      const featuredCount = await prisma.product.count({
        where: { isFeatured: true }
      });
      const activeCount = await prisma.product.count({
        where: { isActive: true }
      });

      const aggregations = await prisma.product.aggregate({
        _avg: { basePrice: true },
        _sum: { stockQuantity: true }
      });

      return {
        total_products: totalProducts,
        low_stock_count: lowStockCount,
        featured_count: featuredCount,
        active_count: activeCount,
        average_price: aggregations._avg.basePrice || 0,
        total_stock_value: aggregations._sum.stockQuantity || 0
      };
    } catch (error) {
      console.error('Get stats error:', error);
      throw error;
    }
  }

  static async updateAllPrices() {
    try {
      const products = await prisma.product.findMany({
        select: {
          id: true,
          materialId: true,
          karatId: true,
          weight: true,
          basePrice: true
        }
      });

      let updatedCount = 0;
      for (const product of products) {
        const newPrice = await this.calculatePrice(
          product.materialId,
          product.karatId,
          product.weight,
          product.basePrice
        );

        // Note: We don't store calculated_price in the new schema
        // Prices are calculated dynamically
        updatedCount++;
      }

      return updatedCount;
    } catch (error) {
      console.error('Update all prices error:', error);
      throw error;
    }
  }
}

export default ProductService;