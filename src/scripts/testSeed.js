import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';

async function testSeed() {
  try {
    console.log('🌱 Starting test seed...');

    // Create a test admin user
    const adminPasswordHash = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.create({
      data: {
        email: 'admin@jewelcart.com',
        passwordHash: adminPasswordHash,
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN'
      }
    });
    console.log('✅ Created admin user:', admin.email);

    // Create a test customer
    const customerPasswordHash = await bcrypt.hash('customer123', 12);
    const customer = await prisma.customer.create({
      data: {
        email: 'customer@jewelcart.com',
        passwordHash: customerPasswordHash,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+91 9876543210',
        status: 'CUSTOMER'
      }
    });
    console.log('✅ Created customer:', customer.email);

    // Create materials and karats
    const goldMaterial = await prisma.material.create({
      data: {
        name: 'Gold',
        type: 'GOLD',
        isActive: true
      }
    });

    const silverMaterial = await prisma.material.create({
      data: {
        name: 'Silver',
        type: 'SILVER',
        isActive: true
      }
    });

    // Create karats for gold
    await prisma.karat.createMany({
      data: [
        { materialId: goldMaterial.id, value: '24K', purity: 99.9, pricePerGram: 6500 },
        { materialId: goldMaterial.id, value: '22K', purity: 91.6, pricePerGram: 5950 },
        { materialId: goldMaterial.id, value: '18K', purity: 75.0, pricePerGram: 4875 }
      ]
    });

    // Create karats for silver
    await prisma.karat.createMany({
      data: [
        { materialId: silverMaterial.id, value: '999', purity: 99.9, pricePerGram: 85 },
        { materialId: silverMaterial.id, value: '925', purity: 92.5, pricePerGram: 78 }
      ]
    });

    console.log('✅ Created materials and karats');

    // Create categories
    await prisma.category.createMany({
      data: [
        { name: 'Rings', description: 'Beautiful rings for all occasions', status: 'ACTIVE', sortOrder: 1 },
        { name: 'Necklaces', description: 'Elegant necklaces and chains', status: 'ACTIVE', sortOrder: 2 },
        { name: 'Earrings', description: 'Stunning earrings collection', status: 'ACTIVE', sortOrder: 3 },
        { name: 'Bracelets', description: 'Stylish bracelets and bangles', status: 'ACTIVE', sortOrder: 4 }
      ]
    });

    console.log('✅ Created categories');
    console.log('🎉 Test seed completed successfully!');

  } catch (error) {
    console.error('❌ Test seed failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSeed();