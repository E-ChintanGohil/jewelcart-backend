import { executeQuery, executeTransaction } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

class Product {
  static async calculatePrice(materialId, karatId, weight, basePrice = 0) {
    try {
      const karats = await executeQuery(`
        SELECT k.price_per_gram
        FROM karats k
        WHERE k.id = ? AND k.material_id = ?
      `, [karatId, materialId]);

      if (karats.length === 0) {
        return basePrice;
      }

      const materialCost = karats[0].price_per_gram * weight;
      return Math.round(materialCost + basePrice);
    } catch (error) {
      console.error('Price calculation error:', error);
      return basePrice;
    }
  }

  static async findById(id) {
    const products = await executeQuery(`
      SELECT p.*,
             c.name as category_name,
             m.name as material_name, m.type as material_type,
             k.value as karat_value, k.purity as karat_purity,
             GROUP_CONCAT(DISTINCT pi.image_url ORDER BY pi.sort_order) as images,
             GROUP_CONCAT(DISTINCT pt.tag) as tags
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN materials m ON p.material_id = m.id
      LEFT JOIN karats k ON p.karat_id = k.id
      LEFT JOIN product_images pi ON p.id = pi.product_id
      LEFT JOIN product_tags pt ON p.id = pt.product_id
      WHERE p.id = ?
      GROUP BY p.id
    `, [id]);

    if (products.length === 0) return null;

    const product = products[0];
    return {
      ...product,
      images: product.images ? product.images.split(',') : [],
      tags: product.tags ? product.tags.split(',') : []
    };
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT p.*,
             c.name as category_name,
             m.name as material_name, m.type as material_type,
             k.value as karat_value,
             (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) as primary_image,
             GROUP_CONCAT(DISTINCT pt.tag) as tags
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN materials m ON p.material_id = m.id
      LEFT JOIN karats k ON p.karat_id = k.id
      LEFT JOIN product_tags pt ON p.id = pt.product_id
    `;

    const conditions = [];
    const values = [];

    // Filter conditions
    if (filters.category_id) {
      conditions.push('p.category_id = ?');
      values.push(filters.category_id);
    }

    if (filters.category) {
      conditions.push('c.name = ?');
      values.push(filters.category);
    }

    if (filters.collection) {
      conditions.push('p.collection = ?');
      values.push(filters.collection);
    }

    if (filters.material_type) {
      conditions.push('m.type = ?');
      values.push(filters.material_type);
    }

    if (filters.featured !== undefined) {
      conditions.push('p.featured = ?');
      values.push(filters.featured);
    }

    if (filters.is_active !== undefined) {
      conditions.push('p.is_active = ?');
      values.push(filters.is_active);
    }

    if (filters.search) {
      conditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
    }

    if (filters.min_price) {
      conditions.push('p.calculated_price >= ?');
      values.push(filters.min_price);
    }

    if (filters.max_price) {
      conditions.push('p.calculated_price <= ?');
      values.push(filters.max_price);
    }

    if (filters.low_stock) {
      conditions.push('p.stock < 5');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY p.id';

    // Sorting
    if (filters.sort_by) {
      const sortField = filters.sort_by;
      const sortOrder = filters.sort_order === 'desc' ? 'DESC' : 'ASC';

      if (['name', 'calculated_price', 'created_at', 'stock'].includes(sortField)) {
        query += ` ORDER BY p.${sortField} ${sortOrder}`;
      }
    } else {
      query += ' ORDER BY p.created_at DESC';
    }

    // Pagination
    if (filters.limit) {
      query += ' LIMIT ?';
      values.push(parseInt(filters.limit));

      if (filters.offset) {
        query += ' OFFSET ?';
        values.push(parseInt(filters.offset));
      }
    }

    const products = await executeQuery(query, values);

    return products.map(product => ({
      ...product,
      tags: product.tags ? product.tags.split(',') : []
    }));
  }

  static async create(productData) {
    const {
      name, description, basePrice, categoryId, subcategory, collection,
      materialId, karatId, gemstone, weight, dimensions, stock,
      featured = false, isActive = true, sku, certification,
      images = [], tags = []
    } = productData;

    // Calculate price
    const calculatedPrice = await this.calculatePrice(materialId, karatId, weight, basePrice);

    const id = uuidv4();

    const queries = [
      {
        query: `
          INSERT INTO products (
            id, name, description, base_price, calculated_price, category_id,
            subcategory, collection, material_id, karat_id, gemstone, weight,
            dimensions, stock, featured, is_active, sku, certification
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          id,
          name ?? null,
          description ?? null,
          basePrice ?? null,
          calculatedPrice ?? null,
          categoryId ?? null,
          subcategory ?? null,
          collection ?? null,
          materialId ?? null,
          karatId ?? null,
          gemstone ?? null,
          weight ?? null,
          dimensions ?? null,
          stock ?? null,
          featured ?? false,
          isActive ?? true,
          sku ?? null,
          certification ?? null
        ]
      }
    ];

    // Add images
    images.forEach((imageUrl, index) => {
      queries.push({
        query: 'INSERT INTO product_images (id, product_id, image_url, sort_order) VALUES (?, ?, ?, ?)',
        params: [uuidv4(), id, imageUrl, index]
      });
    });

    // Add tags
    tags.forEach(tag => {
      queries.push({
        query: 'INSERT INTO product_tags (id, product_id, tag) VALUES (?, ?, ?)',
        params: [uuidv4(), id, tag]
      });
    });

    await executeTransaction(queries);
    return await this.findById(id);
  }

  static async update(id, updates) {
    const product = await this.findById(id);
    if (!product) {
      throw new Error('Product not found');
    }

    const {
      name, description, basePrice, categoryId, subcategory, collection,
      materialId, karatId, gemstone, weight, dimensions, stock,
      featured, isActive, sku, certification, images, tags
    } = updates;

    // Calculate new price if relevant fields changed
    let calculatedPrice = product.calculated_price;
    if (materialId || karatId || weight !== undefined || basePrice !== undefined) {
      calculatedPrice = await this.calculatePrice(
        materialId || product.material_id,
        karatId || product.karat_id,
        weight !== undefined ? weight : product.weight,
        basePrice !== undefined ? basePrice : product.base_price
      );
    }

    const queries = [];

    // Update product
    const setClause = [];
    const values = [];

    const fieldsToUpdate = {
      name, description, base_price: basePrice, category_id: categoryId,
      subcategory, collection, material_id: materialId, karat_id: karatId,
      gemstone, weight, dimensions, stock, featured, is_active: isActive,
      sku, certification, calculated_price: calculatedPrice
    };

    Object.entries(fieldsToUpdate).forEach(([key, value]) => {
      if (value !== undefined) {
        setClause.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (setClause.length > 0) {
      values.push(id);
      queries.push({
        query: `UPDATE products SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params: values
      });
    }

    // Update images if provided
    if (images !== undefined) {
      queries.push({
        query: 'DELETE FROM product_images WHERE product_id = ?',
        params: [id]
      });

      images.forEach((imageUrl, index) => {
        queries.push({
          query: 'INSERT INTO product_images (id, product_id, image_url, sort_order) VALUES (?, ?, ?, ?)',
          params: [uuidv4(), id, imageUrl, index]
        });
      });
    }

    // Update tags if provided
    if (tags !== undefined) {
      queries.push({
        query: 'DELETE FROM product_tags WHERE product_id = ?',
        params: [id]
      });

      tags.forEach(tag => {
        queries.push({
          query: 'INSERT INTO product_tags (id, product_id, tag) VALUES (?, ?, ?)',
          params: [uuidv4(), id, tag]
        });
      });
    }

    if (queries.length > 0) {
      await executeTransaction(queries);
    }

    return await this.findById(id);
  }

  static async delete(id) {
    const result = await executeQuery('DELETE FROM products WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async updateStock(id, quantity, operation = 'decrease') {
    const product = await this.findById(id);
    if (!product) {
      throw new Error('Product not found');
    }

    const newStock = operation === 'decrease'
      ? product.stock - quantity
      : product.stock + quantity;

    if (newStock < 0) {
      throw new Error('Insufficient stock');
    }

    await executeQuery(
      'UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStock, id]
    );

    return newStock;
  }

  static async getStats() {
    const stats = await executeQuery(`
      SELECT
        COUNT(*) as total_products,
        SUM(CASE WHEN stock < 5 THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN featured = 1 THEN 1 ELSE 0 END) as featured_count,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_count,
        AVG(calculated_price) as average_price,
        SUM(stock) as total_stock_value
      FROM products
    `);

    return stats[0];
  }

  static async updateAllPrices() {
    const products = await executeQuery('SELECT id, material_id, karat_id, weight, base_price FROM products');

    for (const product of products) {
      const newPrice = await this.calculatePrice(
        product.material_id,
        product.karat_id,
        product.weight,
        product.base_price
      );

      await executeQuery(
        'UPDATE products SET calculated_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newPrice, product.id]
      );
    }

    return products.length;
  }
}

export default Product;