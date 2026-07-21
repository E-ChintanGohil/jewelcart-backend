import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { runSitemapRefresh } from '../jobs/sitemapScheduler.js';

const router = express.Router();

// Force a sitemap rebuild + upload now (e.g. right after adding products), so
// the client doesn't have to wait for the daily cron. Admin only.
router.post('/refresh', authenticateToken, requireAdmin, async (req, res) => {
  const result = await runSitemapRefresh({ trigger: `admin:${req.user?.userId ?? 'unknown'}` });
  if (result.ok) {
    return res.json({ success: true, ...result });
  }
  return res.status(503).json({ success: false, message: result.error });
});

export default router;
