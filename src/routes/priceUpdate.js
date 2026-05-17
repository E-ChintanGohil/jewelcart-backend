import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireStaff } from '../middleware/auth.js';
import { runPriceUpdate } from '../services/priceUpdateService.js';
import { startPriceUpdateScheduler, stopPriceUpdateScheduler } from '../jobs/priceUpdateScheduler.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/price-update/status — last run, current settings, next-fire info
router.get('/status', authenticateToken, requireStaff, async (_req, res) => {
  const s = await prisma.siteSetting.findFirst();
  if (!s) return res.json({ enabled: false });
  res.json({
    enabled: s.priceUpdateEnabled,
    importDutyPercent: s.importDutyPercent,
    gstOnMetalPercent: s.gstOnMetalPercent,
    hasApiKey: !!(s.metalPriceApiKey || process.env.METALPRICE_API_KEY),
    lastPriceUpdateAt: s.lastPriceUpdateAt,
    lastGoldRateInr: s.lastGoldRateInr,
    lastSilverRateInr: s.lastSilverRateInr,
    lastPriceUpdateStatus: s.lastPriceUpdateStatus,
    lastPriceBreakdown: s.lastPriceBreakdown,
    schedule: '10:00 and 17:00 Asia/Kolkata',
  });
});

// GET /api/price-update/history — recent fetch attempts (newest first)
router.get('/history', authenticateToken, requireStaff, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const rows = await prisma.priceFetchHistory.findMany({
    orderBy: { fetchedAt: 'desc' },
    take: limit,
  });
  res.json({ rows });
});

// POST /api/price-update/run — manual trigger
router.post('/run', authenticateToken, requireStaff, async (_req, res) => {
  const result = await runPriceUpdate({ trigger: 'manual' });
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
});

// PUT /api/price-update/settings — admin toggles + rates config
router.put('/settings', authenticateToken, requireStaff, async (req, res) => {
  const { enabled, importDutyPercent, gstOnMetalPercent, metalPriceApiKey } = req.body || {};
  const existing = await prisma.siteSetting.findFirst();
  if (!existing) return res.status(404).json({ error: 'Settings row missing' });

  const data = {};
  if (typeof enabled === 'boolean') data.priceUpdateEnabled = enabled;
  if (importDutyPercent != null) data.importDutyPercent = importDutyPercent;
  if (gstOnMetalPercent != null) data.gstOnMetalPercent = gstOnMetalPercent;
  if (typeof metalPriceApiKey === 'string') data.metalPriceApiKey = metalPriceApiKey || null;

  const updated = await prisma.siteSetting.update({ where: { id: existing.id }, data });

  // Restart scheduler so toggle takes effect immediately
  stopPriceUpdateScheduler();
  await startPriceUpdateScheduler();

  res.json({
    enabled: updated.priceUpdateEnabled,
    importDutyPercent: updated.importDutyPercent,
    gstOnMetalPercent: updated.gstOnMetalPercent,
    hasApiKey: !!(updated.metalPriceApiKey || process.env.METALPRICE_API_KEY),
  });
});

export default router;
