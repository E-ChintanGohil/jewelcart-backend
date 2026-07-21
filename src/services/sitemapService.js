// Builds sitemap.xml from the database so it always reflects the live catalogue.
//
// The URL shape must match the frontend (jewelcart-frontend/src/lib/slug.ts and
// scripts/generate-sitemap.mjs): products are /product/<name-slug>-<id> and the
// site is served on www. Keep the two in sync if either changes.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SITE_URL = (process.env.SITEMAP_SITE_URL || 'https://www.jewelcart.shop').replace(/\/$/, '');

// Fixed, indexable pages. Private/duplicate routes (cart, checkout, login,
// profile, admin) are intentionally excluded.
const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/shop', changefreq: 'daily', priority: '0.9' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
  { path: '/faq', changefreq: 'monthly', priority: '0.4' },
  { path: '/size-guide', changefreq: 'yearly', priority: '0.3' },
  { path: '/jewelry-care', changefreq: 'yearly', priority: '0.3' },
  { path: '/certifications', changefreq: 'yearly', priority: '0.3' },
  { path: '/shipping-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/refund-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/cancellation-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms-conditions', changefreq: 'yearly', priority: '0.3' },
  { path: '/payment-security', changefreq: 'yearly', priority: '0.3' },
];

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function productPath(id, name) {
  const slug = name ? slugify(name) : '';
  return slug ? `/product/${slug}-${id}` : `/product/${id}`;
}

const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const todayISO = () => new Date().toISOString().slice(0, 10);

function urlEntry({ path, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(SITE_URL + path)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority ? `    <priority>${priority}</priority>` : '',
    '  </url>',
  ].filter(Boolean).join('\n');
}

// Returns { xml, urlCount, productCount }.
export async function buildSitemapXml() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { id: 'desc' },
  });

  const today = todayISO();
  const entries = [
    ...STATIC_PAGES.map((p) => urlEntry({ ...p, lastmod: today })),
    ...products.map((p) =>
      urlEntry({
        path: productPath(p.id, p.name),
        lastmod: (p.updatedAt ? p.updatedAt.toISOString().slice(0, 10) : today),
        changefreq: 'weekly',
        priority: '0.8',
      })
    ),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join('\n') +
    '\n</urlset>\n';

  return { xml, urlCount: entries.length, productCount: products.length };
}
