import prisma from '../config/prisma.js';

class OrderService {
  static async getAll(filters = {}) {
    try {
      const where = {};

      if (filters.status) {
        where.status = filters.status.toUpperCase();
      }

      if (filters.payment_status) {
        where.paymentStatus = filters.payment_status.toUpperCase();
      }

      if (filters.customer_id) {
        where.customerId = parseInt(filters.customer_id);
      }

      const orders = await prisma.order.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          billingAddress: true,
          shippingAddress: true,
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        ...(filters.limit && {
          take: parseInt(filters.limit),
          ...(filters.offset && { skip: parseInt(filters.offset) })
        })
      });

      return orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerInfo: {
          id: order.customer.id,
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
          email: order.customer.email,
          phone: order.customer.phone
        },
        billingAddress: order.billingAddress,
        shippingAddress: order.shippingAddress,
        items: order.items.map(item => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice),
          totalPrice: parseFloat(item.totalPrice),
          appliedDiscountPercentage: parseFloat(item.appliedDiscountPercentage),
          product: item.product
        })),
        subtotal: parseFloat(order.subtotal),
        taxAmount: parseFloat(order.taxAmount),
        shippingAmount: parseFloat(order.shippingAmount),
        discountAmount: parseFloat(order.discountAmount),
        totalAmount: parseFloat(order.totalAmount),
        status: order.status.toLowerCase(),
        paymentStatus: order.paymentStatus.toLowerCase(),
        notes: order.notes,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }));
    } catch (error) {
      console.error('Get orders error:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: parseInt(id) },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          billingAddress: true,
          shippingAddress: true,
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true
                }
              }
            }
          },
          statusHistory: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          },
          payments: true
        }
      });

      if (!order) return null;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerInfo: {
          id: order.customer.id,
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
          email: order.customer.email,
          phone: order.customer.phone
        },
        billingAddress: order.billingAddress,
        shippingAddress: order.shippingAddress,
        items: order.items.map(item => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice),
          totalPrice: parseFloat(item.totalPrice),
          appliedDiscountPercentage: parseFloat(item.appliedDiscountPercentage),
          product: item.product
        })),
        subtotal: parseFloat(order.subtotal),
        taxAmount: parseFloat(order.taxAmount),
        shippingAmount: parseFloat(order.shippingAmount),
        discountAmount: parseFloat(order.discountAmount),
        totalAmount: parseFloat(order.totalAmount),
        status: order.status.toLowerCase(),
        paymentStatus: order.paymentStatus.toLowerCase(),
        notes: order.notes,
        statusHistory: order.statusHistory,
        payments: order.payments,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    } catch (error) {
      console.error('Find order by ID error:', error);
      throw error;
    }
  }

  static async create(orderData) {
    try {
      const {
        customerId,
        billingAddressId,
        shippingAddressId,
        items,
        subtotal,
        taxAmount = 0,
        shippingAmount = 0,
        discountAmount = 0,
        totalAmount,
        notes
      } = orderData;

      // Generate order number
      const orderCount = await prisma.order.count();
      const orderNumber = `ORD${String(orderCount + 1).padStart(6, '0')}`;

      // Start transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create order
        const order = await tx.order.create({
          data: {
            orderNumber,
            customerId: parseInt(customerId),
            billingAddressId: parseInt(billingAddressId),
            shippingAddressId: parseInt(shippingAddressId),
            subtotal: parseFloat(subtotal),
            taxAmount: parseFloat(taxAmount),
            shippingAmount: parseFloat(shippingAmount),
            discountAmount: parseFloat(discountAmount),
            totalAmount: parseFloat(totalAmount),
            notes
          }
        });

        // Create order items and update stock
        for (const item of items) {
          const { productId, quantity } = item;

          // Get product details
          const product = await tx.product.findUnique({
            where: { id: parseInt(productId) },
            select: {
              id: true,
              name: true,
              basePrice: true,
              weight: true,
              stockQuantity: true,
              karat: {
                select: {
                  pricePerGram: true
                }
              }
            }
          });

          if (!product) {
            throw new Error(`Product ${productId} not found`);
          }

          if (product.stockQuantity < quantity) {
            throw new Error(`Insufficient stock for product ${product.name}`);
          }

          // Calculate unit price (base price + material cost)
          const materialCost = parseFloat(product.karat.pricePerGram) * parseFloat(product.weight);
          const unitPrice = parseFloat(product.basePrice) + materialCost;
          const totalPrice = unitPrice * quantity;

          // Create order item
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: parseInt(productId),
              productName: product.name,
              quantity: parseInt(quantity),
              unitPrice: unitPrice,
              totalPrice: totalPrice
            }
          });

          // Update product stock
          await tx.product.update({
            where: { id: parseInt(productId) },
            data: {
              stockQuantity: {
                decrement: parseInt(quantity)
              }
            }
          });

          // Record stock movement
          await tx.stockMovement.create({
            data: {
              productId: parseInt(productId),
              movementType: 'SALE',
              quantityChange: -parseInt(quantity),
              referenceType: 'ORDER',
              referenceId: order.id,
              reason: `Order ${orderNumber}`,
              performedBy: 1 // System user - should be passed from auth
            }
          });
        }

        // Update customer statistics
        await tx.customer.update({
          where: { id: parseInt(customerId) },
          data: {
            totalSpent: {
              increment: parseFloat(totalAmount)
            },
            orderCount: {
              increment: 1
            },
            status: 'CUSTOMER' // Convert from lead to customer
          }
        });

        return order;
      });

      return await this.findById(result.id);
    } catch (error) {
      console.error('Create order error:', error);
      throw error;
    }
  }

  static async updateStatus(id, statusData, changedBy = 1) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: parseInt(id) }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const { status, paymentStatus } = statusData;
      const updateData = {};

      if (status !== undefined) {
        updateData.status = status.toUpperCase();
      }

      if (paymentStatus !== undefined) {
        updateData.paymentStatus = paymentStatus.toUpperCase();
      }

      const result = await prisma.$transaction(async (tx) => {
        // Update order
        const updatedOrder = await tx.order.update({
          where: { id: parseInt(id) },
          data: updateData
        });

        // Record status history if status changed
        if (status && status.toUpperCase() !== order.status) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: parseInt(id),
              fromStatus: order.status.toLowerCase(),
              toStatus: status.toLowerCase(),
              changedBy: parseInt(changedBy)
            }
          });
        }

        return updatedOrder;
      });

      return await this.findById(result.id);
    } catch (error) {
      console.error('Update order status error:', error);
      throw error;
    }
  }

  static async getStats() {
    try {
      const stats = await prisma.order.aggregate({
        _count: {
          id: true
        },
        _sum: {
          totalAmount: true
        },
        _avg: {
          totalAmount: true
        }
      });

      const statusCounts = await prisma.order.groupBy({
        by: ['status'],
        _count: {
          status: true
        }
      });

      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);

      const recentStats = await prisma.order.aggregate({
        where: {
          createdAt: {
            gte: last30Days
          }
        },
        _count: {
          id: true
        },
        _sum: {
          totalAmount: true
        }
      });

      const statusCountsMap = {};
      statusCounts.forEach(item => {
        statusCountsMap[item.status.toLowerCase()] = item._count.status;
      });

      return {
        total_orders: stats._count.id || 0,
        pending_orders: statusCountsMap.pending || 0,
        processing_orders: statusCountsMap.processing || 0,
        shipped_orders: statusCountsMap.shipped || 0,
        delivered_orders: statusCountsMap.delivered || 0,
        cancelled_orders: statusCountsMap.cancelled || 0,
        total_revenue: parseFloat(stats._sum.totalAmount || 0),
        average_order_value: parseFloat(stats._avg.totalAmount || 0),
        revenue_last_30_days: parseFloat(recentStats._sum.totalAmount || 0),
        orders_last_30_days: recentStats._count.id || 0
      };
    } catch (error) {
      console.error('Get order stats error:', error);
      throw error;
    }
  }
}

export default OrderService;