import prisma from '../config/prisma.js';
import SKUService from './skuService.js';

// ─── Helpers for new product fields ──────────────────────────────────────────
const normalizeJsonArray = (value) => {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) {
    const cleaned = value.filter(v => v != null && v !== '');
    return cleaned.length > 0 ? cleaned : null;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeJsonArray(parsed);
    } catch {
      return value.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return null;
};

const parseIntOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = parseInt(v);
  return Number.isFinite(n) ? n : null;
};

const parseFloatOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const hasDiamondData = (d) =>
  !!(d && (d.shape || d.count != null || d.totalWeight != null || d.color || d.clarity || d.sizeRange));

class ProductService {
  // basePrice is now "making charge per gram"
  // Formula: (pricePerGram + makingChargePerGram) × weight
  static async calculatePrice(materialId, karatId, weight, basePrice = 0) {
    try {
      const karat = await prisma.karat.findFirst({
        where: {
          id: karatId,
          materialId: materialId
        }
      });

      const w = parseFloat(weight) || 0;
      const makingChargePerGram = parseFloat(basePrice) || 0;

      if (!karat) {
        return Math.round(makingChargePerGram * w);
      }

      const pricePerGram = parseFloat(karat.pricePerGram);
      return Math.round((pricePerGram + makingChargePerGram) * w);
    } catch (error) {
      console.error('Price calculation error:', error);
      return Math.round((parseFloat(basePrice) || 0) * (parseFloat(weight) || 0));
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
          tags: true,
          diamondDetails: true,
          stoneDetails: { orderBy: { sortOrder: 'asc' } },
          priceBreakup: { orderBy: { sortOrder: 'asc' } },
        }
      });

      if (!product) return null;

      const calculatedPrice = await this.calculatePrice(product.materialId, product.karatId, product.weight, product.basePrice);

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
        calculated_price: calculatedPrice,
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

        // Phase 1: color + purity
        available_colors: product.availableColors || [],
        availableColors: product.availableColors || [],
        default_color: product.defaultColor,
        defaultColor: product.defaultColor,
        available_purities: product.availablePurities || [],
        availablePurities: product.availablePurities || [],
        default_purity: product.defaultPurity,
        defaultPurity: product.defaultPurity,

        // Phase 2: size
        size_min: product.sizeMin,
        sizeMin: product.sizeMin,
        size_max: product.sizeMax,
        sizeMax: product.sizeMax,
        size_unit: product.sizeUnit,
        sizeUnit: product.sizeUnit,

        // Phase 3: diamond / stones
        diamond_details: product.diamondDetails ? {
          shape: product.diamondDetails.shape,
          count: product.diamondDetails.count,
          total_weight: product.diamondDetails.totalWeight ? parseFloat(product.diamondDetails.totalWeight) : null,
          totalWeight: product.diamondDetails.totalWeight ? parseFloat(product.diamondDetails.totalWeight) : null,
          color: product.diamondDetails.color,
          clarity: product.diamondDetails.clarity,
          size_range: product.diamondDetails.sizeRange,
          sizeRange: product.diamondDetails.sizeRange,
        } : null,
        diamondDetails: product.diamondDetails ? {
          shape: product.diamondDetails.shape,
          count: product.diamondDetails.count,
          totalWeight: product.diamondDetails.totalWeight ? parseFloat(product.diamondDetails.totalWeight) : null,
          color: product.diamondDetails.color,
          clarity: product.diamondDetails.clarity,
          sizeRange: product.diamondDetails.sizeRange,
        } : null,
        stone_details: product.stoneDetails.map(s => ({
          name: s.name,
          count: s.count,
          total_weight: s.totalWeight ? parseFloat(s.totalWeight) : null,
          totalWeight: s.totalWeight ? parseFloat(s.totalWeight) : null,
        })),
        stoneDetails: product.stoneDetails.map(s => ({
          name: s.name,
          count: s.count,
          totalWeight: s.totalWeight ? parseFloat(s.totalWeight) : null,
        })),

        // Phase 4: price breakup
        price_breakup: product.priceBreakup.map(b => ({
          label: b.label,
          amount: parseFloat(b.amount),
        })),
        priceBreakup: product.priceBreakup.map(b => ({
          label: b.label,
          amount: parseFloat(b.amount),
        })),

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
        price: calculatedPrice
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
        isActive = true, certification, images = [], tags = [],
        // Phase 1
        availableColors, defaultColor, availablePurities, defaultPurity,
        // Phase 2
        sizeMin, sizeMax, sizeUnit,
        // Phase 3
        diamondDetails, stoneDetails,
        // Phase 4
        priceBreakup,
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
            isActive,
            availableColors: normalizeJsonArray(availableColors),
            defaultColor: defaultColor || null,
            availablePurities: normalizeJsonArray(availablePurities),
            defaultPurity: defaultPurity || null,
            sizeMin: sizeMin != null && sizeMin !== '' ? parseInt(sizeMin) : null,
            sizeMax: sizeMax != null && sizeMax !== '' ? parseInt(sizeMax) : null,
            sizeUnit: sizeUnit || null,
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

        // Diamond details (single row)
        if (diamondDetails && hasDiamondData(diamondDetails)) {
          await tx.productDiamondDetail.create({
            data: {
              productId: product.id,
              shape: diamondDetails.shape || null,
              count: parseIntOrNull(diamondDetails.count),
              totalWeight: parseFloatOrNull(diamondDetails.totalWeight),
              color: diamondDetails.color || null,
              clarity: diamondDetails.clarity || null,
              sizeRange: diamondDetails.sizeRange || null,
            }
          });
        }

        // Other stones (multi-row)
        if (Array.isArray(stoneDetails) && stoneDetails.length > 0) {
          await tx.productStoneDetail.createMany({
            data: stoneDetails
              .filter(s => s && s.name)
              .map((s, i) => ({
                productId: product.id,
                name: s.name,
                count: parseIntOrNull(s.count),
                totalWeight: parseFloatOrNull(s.totalWeight),
                sortOrder: i,
              }))
          });
        }

        // Price breakup (multi-row)
        if (Array.isArray(priceBreakup) && priceBreakup.length > 0) {
          await tx.productPriceBreakup.createMany({
            data: priceBreakup
              .filter(b => b && b.label && b.amount != null && b.amount !== '')
              .map((b, i) => ({
                productId: product.id,
                label: b.label,
                amount: parseFloat(b.amount),
                sortOrder: i,
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
        certification, images, tags, existingImageData, primaryImageUrl,
        // Phase 1
        availableColors, defaultColor, availablePurities, defaultPurity,
        // Phase 2
        sizeMin, sizeMax, sizeUnit,
        // Phase 3
        diamondDetails, stoneDetails,
        // Phase 4
        priceBreakup,
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
        if (availableColors !== undefined) updateData.availableColors = normalizeJsonArray(availableColors);
        if (defaultColor !== undefined) updateData.defaultColor = defaultColor || null;
        if (availablePurities !== undefined) updateData.availablePurities = normalizeJsonArray(availablePurities);
        if (defaultPurity !== undefined) updateData.defaultPurity = defaultPurity || null;
        if (sizeMin !== undefined) updateData.sizeMin = sizeMin === null || sizeMin === '' ? null : parseInt(sizeMin);
        if (sizeMax !== undefined) updateData.sizeMax = sizeMax === null || sizeMax === '' ? null : parseInt(sizeMax);
        if (sizeUnit !== undefined) updateData.sizeUnit = sizeUnit || null;

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

        // Diamond details — replace if provided
        if (diamondDetails !== undefined) {
          await tx.productDiamondDetail.deleteMany({ where: { productId: parseInt(id) } });
          if (diamondDetails && hasDiamondData(diamondDetails)) {
            await tx.productDiamondDetail.create({
              data: {
                productId: parseInt(id),
                shape: diamondDetails.shape || null,
                count: parseIntOrNull(diamondDetails.count),
                totalWeight: parseFloatOrNull(diamondDetails.totalWeight),
                color: diamondDetails.color || null,
                clarity: diamondDetails.clarity || null,
                sizeRange: diamondDetails.sizeRange || null,
              }
            });
          }
        }

        // Other stones — replace
        if (stoneDetails !== undefined) {
          await tx.productStoneDetail.deleteMany({ where: { productId: parseInt(id) } });
          if (Array.isArray(stoneDetails) && stoneDetails.length > 0) {
            await tx.productStoneDetail.createMany({
              data: stoneDetails
                .filter(s => s && s.name)
                .map((s, i) => ({
                  productId: parseInt(id),
                  name: s.name,
                  count: parseIntOrNull(s.count),
                  totalWeight: parseFloatOrNull(s.totalWeight),
                  sortOrder: i,
                }))
            });
          }
        }

        // Price breakup — replace
        if (priceBreakup !== undefined) {
          await tx.productPriceBreakup.deleteMany({ where: { productId: parseInt(id) } });
          if (Array.isArray(priceBreakup) && priceBreakup.length > 0) {
            await tx.productPriceBreakup.createMany({
              data: priceBreakup
                .filter(b => b && b.label && b.amount != null && b.amount !== '')
                .map((b, i) => ({
                  productId: parseInt(id),
                  label: b.label,
                  amount: parseFloat(b.amount),
                  sortOrder: i,
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