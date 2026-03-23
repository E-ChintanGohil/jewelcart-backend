import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';

async function seed() {
  console.log('🌱 Seeding database...');

  // ── Admin user ──────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@jewelcart.com' },
    update: {},
    create: {
      email: 'admin@jewelcart.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });
  console.log('✅ Admin user:', admin.email);

  // ── Staff user ───────────────────────────────────────────────────────────────
  const staffHash = await bcrypt.hash('staff123', 12);
  await prisma.user.upsert({
    where: { email: 'staff@jewelcart.com' },
    update: {},
    create: {
      email: 'staff@jewelcart.com',
      passwordHash: staffHash,
      firstName: 'Staff',
      lastName: 'User',
      role: 'STAFF',
    },
  });
  console.log('✅ Staff user: staff@jewelcart.com');

  // ── Test customer ────────────────────────────────────────────────────────────
  const custHash = await bcrypt.hash('customer123', 12);
  const customer = await prisma.customer.upsert({
    where: { email: 'customer@jewelcart.com' },
    update: {},
    create: {
      email: 'customer@jewelcart.com',
      passwordHash: custHash,
      firstName: 'Test',
      lastName: 'Customer',
      status: 'CUSTOMER',
    },
  });
  console.log('✅ Customer:', customer.email);

  // ── Materials & karats ───────────────────────────────────────────────────────
  const gold = await prisma.material.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Gold', type: 'GOLD' },
  });

  const silver = await prisma.material.upsert({
    where: { id: 2 },
    update: {},
    create: { name: 'Silver', type: 'SILVER' },
  });

  const karats = [
    { materialId: gold.id, value: '24K', purity: 99.99, pricePerGram: 620 },
    { materialId: gold.id, value: '22K', purity: 91.67, pricePerGram: 570 },
    { materialId: gold.id, value: '18K', purity: 75.00, pricePerGram: 470 },
    { materialId: silver.id, value: '999 Fine', purity: 99.90, pricePerGram: 8 },
    { materialId: silver.id, value: '925 Sterling', purity: 92.50, pricePerGram: 7 },
  ];

  const createdKarats = [];
  for (const k of karats) {
    const karat = await prisma.karat.upsert({
      where: { id: createdKarats.length + 1 },
      update: { pricePerGram: k.pricePerGram },
      create: k,
    });
    createdKarats.push(karat);
  }
  console.log('✅ Materials & karats seeded');

  // ── Categories ───────────────────────────────────────────────────────────────
  const categoryNames = ['Rings', 'Necklaces', 'Earrings', 'Bracelets', 'Bangles', 'Pendants'];
  const categories = [];
  for (let i = 0; i < categoryNames.length; i++) {
    const cat = await prisma.category.upsert({
      where: { name: categoryNames[i] },
      update: {},
      create: { name: categoryNames[i], sortOrder: i },
    });
    categories.push(cat);
  }
  console.log('✅ Categories seeded:', categoryNames.join(', '));

  // ── Sample products ──────────────────────────────────────────────────────────
  const products = [
    { name: 'Classic Gold Ring', categoryId: categories[0].id, materialId: gold.id, karatId: createdKarats[1].id, basePrice: 500, weight: 4.5, isFeatured: true, stockQuantity: 10 },
    { name: 'Diamond Necklace', categoryId: categories[1].id, materialId: gold.id, karatId: createdKarats[2].id, basePrice: 2000, weight: 8.0, isFeatured: true, stockQuantity: 5 },
    { name: 'Silver Hoop Earrings', categoryId: categories[2].id, materialId: silver.id, karatId: createdKarats[4].id, basePrice: 200, weight: 3.0, isFeatured: false, stockQuantity: 20 },
    { name: 'Gold Bangle Set', categoryId: categories[4].id, materialId: gold.id, karatId: createdKarats[1].id, basePrice: 800, weight: 12.0, isFeatured: true, stockQuantity: 8 },
    { name: 'Sterling Silver Bracelet', categoryId: categories[3].id, materialId: silver.id, karatId: createdKarats[4].id, basePrice: 350, weight: 5.5, isFeatured: false, stockQuantity: 15 },
    { name: 'Gold Pendant', categoryId: categories[5].id, materialId: gold.id, karatId: createdKarats[2].id, basePrice: 600, weight: 2.5, isFeatured: true, stockQuantity: 12 },
  ];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const sku = `JC-${String(i + 1).padStart(4, '0')}`;
    await prisma.product.upsert({
      where: { sku },
      update: {},
      create: { ...p, sku },
    });
  }
  console.log('✅ Sample products seeded');

  // ── Sample coupon ────────────────────────────────────────────────────────────
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: 1000,
      maxUses: 100,
      isActive: true,
    },
  });
  console.log('✅ Sample coupon: WELCOME10 (10% off, min ₹1000)');

  console.log('\n🎉 Seed complete!');
  console.log('   Admin:    admin@jewelcart.com / admin123');
  console.log('   Staff:    staff@jewelcart.com / staff123');
  console.log('   Customer: customer@jewelcart.com / customer123');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
