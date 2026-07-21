// Daily refresh of the live sitemap.xml on www.jewelcart.shop.
//
// Rebuilds the sitemap from the DB and uploads it to the cPanel docroot, so
// products added in admin show up in the sitemap automatically (within a day)
// with no redeploy. Prod-gated: only arms when SITEMAP_CRON_ENABLED=true, which
// is set only in the prod backend .env — staging never touches the live docroot.

import cron from 'node-cron';
import { buildSitemapXml } from '../services/sitemapService.js';
import { uploadFile, isUploaderConfigured } from '../services/cpanelUploader.js';

const TIMEZONE = 'Asia/Kolkata';
const REMOTE_DIR = process.env.SITEMAP_REMOTE_DIR || '/public_html';

let scheduled = null;

// Build + upload once. Returns a summary; never throws (logs and returns error).
export async function runSitemapRefresh({ trigger = 'manual' } = {}) {
  const started = Date.now();
  try {
    if (!isUploaderConfigured()) {
      throw new Error('cPanel credentials not configured');
    }
    const { xml, urlCount, productCount } = await buildSitemapXml();
    await uploadFile(REMOTE_DIR, 'sitemap.xml', xml);
    const ms = Date.now() - started;
    console.log(`[sitemap] refreshed (${trigger}): ${urlCount} URLs, ${productCount} products → ${REMOTE_DIR}/sitemap.xml in ${ms}ms`);
    return { ok: true, urlCount, productCount, ms };
  } catch (err) {
    console.error(`[sitemap] refresh failed (${trigger}): ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export function startSitemapScheduler() {
  if (scheduled) return;

  if (process.env.SITEMAP_CRON_ENABLED !== 'true') {
    console.log('[sitemap] scheduler disabled (SITEMAP_CRON_ENABLED != true)');
    return;
  }
  if (!isUploaderConfigured()) {
    console.log('[sitemap] scheduler NOT armed — cPanel credentials missing');
    return;
  }

  // 03:30 IST daily — quiet hours, after any late catalogue edits.
  scheduled = cron.schedule('30 3 * * *', () => runSitemapRefresh({ trigger: 'cron' }), { timezone: TIMEZONE });
  console.log('[sitemap] scheduler armed for 03:30 Asia/Kolkata');
}

export function stopSitemapScheduler() {
  if (scheduled) scheduled.stop();
  scheduled = null;
}
