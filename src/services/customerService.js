import prisma from '../config/prisma.js';

class CustomerService {
  static async getAll(filters = {}) {
    try {
      const where = {};

      if (filters.status) {
        where.status = filters.status.toUpperCase();
      }

      if (filters.search) {
        where.OR = [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const customers = await prisma.customer.findMany({
        where,
        include: {
          addresses: {
            where: { isDefault: true },
            take: 1
          },
          notes: {
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
            },
            take: 5 // Only get recent notes for list view
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

      return customers.map(customer => ({
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        dateOfBirth: customer.dateOfBirth,
        leadSource: customer.leadSource,
        status: customer.status.toLowerCase(),
        totalSpent: parseFloat(customer.totalSpent),
        orderCount: customer.orderCount,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        address: customer.addresses[0] ? {
          street: customer.addresses[0].street,
          city: customer.addresses[0].city,
          state: customer.addresses[0].state,
          zipCode: customer.addresses[0].zipCode,
          country: customer.addresses[0].country
        } : null,
        notes: customer.notes.map(note => ({
          id: note.id,
          note: note.note,
          createdAt: note.createdAt,
          createdBy: note.user ? `${note.user.firstName} ${note.user.lastName}` : 'System'
        }))
      }));
    } catch (error) {
      console.error('Get customers error:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: parseInt(id) },
        include: {
          addresses: {
            orderBy: { isDefault: 'desc' }
          },
          notes: {
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
          orders: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              status: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });

      if (!customer) return null;

      return {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        dateOfBirth: customer.dateOfBirth,
        leadSource: customer.leadSource,
        status: customer.status.toLowerCase(),
        totalSpent: parseFloat(customer.totalSpent),
        orderCount: customer.orderCount,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        addresses: customer.addresses.map(addr => ({
          id: addr.id,
          type: addr.type,
          contactName: addr.contactName,
          street: addr.street,
          city: addr.city,
          state: addr.state,
          zipCode: addr.zipCode,
          country: addr.country,
          phone: addr.phone,
          isDefault: addr.isDefault
        })),
        notes: customer.notes.map(note => ({
          id: note.id,
          note: note.note,
          createdAt: note.createdAt,
          createdBy: note.user ? `${note.user.firstName} ${note.user.lastName}` : 'System'
        })),
        orders: customer.orders.map(order => ({
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: parseFloat(order.totalAmount),
          status: order.status.toLowerCase(),
          createdAt: order.createdAt
        }))
      };
    } catch (error) {
      console.error('Find customer by ID error:', error);
      throw error;
    }
  }

  static async create(customerData) {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        leadSource,
        status = 'LEAD',
        address
      } = customerData;

      const result = await prisma.$transaction(async (tx) => {
        // Create customer
        const customer = await tx.customer.create({
          data: {
            firstName,
            lastName,
            email,
            phone,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            leadSource,
            status: status.toUpperCase()
          }
        });

        // Create default address if provided
        if (address && address.street) {
          await tx.customerAddress.create({
            data: {
              customerId: customer.id,
              type: 'HOME',
              street: address.street,
              city: address.city,
              state: address.state,
              zipCode: address.zipCode,
              country: address.country || 'India',
              isDefault: true
            }
          });
        }

        return customer;
      });

      return await this.findById(result.id);
    } catch (error) {
      console.error('Create customer error:', error);
      throw error;
    }
  }

  static async update(id, updates) {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: parseInt(id) }
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        leadSource,
        status,
        address
      } = updates;

      const updateData = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
      if (leadSource !== undefined) updateData.leadSource = leadSource;
      if (status !== undefined) updateData.status = status.toUpperCase();

      const result = await prisma.$transaction(async (tx) => {
        // Update customer
        const updatedCustomer = await tx.customer.update({
          where: { id: parseInt(id) },
          data: updateData
        });

        // Update default address if provided
        if (address) {
          const existingAddress = await tx.customerAddress.findFirst({
            where: {
              customerId: parseInt(id),
              isDefault: true
            }
          });

          if (existingAddress) {
            await tx.customerAddress.update({
              where: { id: existingAddress.id },
              data: {
                street: address.street,
                city: address.city,
                state: address.state,
                zipCode: address.zipCode,
                country: address.country || 'India'
              }
            });
          } else if (address.street) {
            await tx.customerAddress.create({
              data: {
                customerId: parseInt(id),
                type: 'HOME',
                street: address.street,
                city: address.city,
                state: address.state,
                zipCode: address.zipCode,
                country: address.country || 'India',
                isDefault: true
              }
            });
          }
        }

        return updatedCustomer;
      });

      return await this.findById(result.id);
    } catch (error) {
      console.error('Update customer error:', error);
      throw error;
    }
  }

  static async addNote(customerId, noteText, createdBy = 1) {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: parseInt(customerId) }
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      const note = await prisma.customerNote.create({
        data: {
          customerId: parseInt(customerId),
          note: noteText,
          createdBy: parseInt(createdBy)
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      });

      return {
        id: note.id,
        note: note.note,
        createdAt: note.createdAt,
        createdBy: note.user ? `${note.user.firstName} ${note.user.lastName}` : 'System'
      };
    } catch (error) {
      console.error('Add customer note error:', error);
      throw error;
    }
  }

  static async getStats() {
    try {
      const totalCustomers = await prisma.customer.count();

      const statusCounts = await prisma.customer.groupBy({
        by: ['status'],
        _count: {
          status: true
        }
      });

      const revenueStats = await prisma.customer.aggregate({
        _sum: {
          totalSpent: true
        },
        _avg: {
          totalSpent: true
        }
      });

      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);

      const recentCustomers = await prisma.customer.count({
        where: {
          createdAt: {
            gte: last30Days
          }
        }
      });

      const statusCountsMap = {};
      statusCounts.forEach(item => {
        statusCountsMap[item.status.toLowerCase()] = item._count.status;
      });

      return {
        total_customers: totalCustomers,
        lead_customers: statusCountsMap.lead || 0,
        active_customers: statusCountsMap.customer || 0,
        vip_customers: statusCountsMap.vip || 0,
        total_revenue: parseFloat(revenueStats._sum.totalSpent || 0),
        average_customer_value: parseFloat(revenueStats._avg.totalSpent || 0),
        new_customers_last_30_days: recentCustomers
      };
    } catch (error) {
      console.error('Get customer stats error:', error);
      throw error;
    }
  }
}

export default CustomerService;