import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { runPriceUpdate } from '../services/priceUpdateService.js';

const prisma = new PrismaClient();
const TIMEZONE = 'Asia/Kolkata';

let scheduled = [];

export async function startPriceUpdateScheduler() {
  if (scheduled.length) return;

  const settings = await prisma.siteSetting.findFirst().catch(() => null);
  const enabled = settings?.priceUpdateEnabled ?? false;

  if (!enabled) {
    console.log('[priceUpdate] scheduler disabled (settings.priceUpdateEnabled = false)');
    return;
  }

  // 10:00 IST and 17:00 IST every day
  const tenAm = cron.schedule('0 10 * * *', () => runPriceUpdate({ trigger: 'cron-10am' }), { timezone: TIMEZONE });
  const fivePm = cron.schedule('0 17 * * *', () => runPriceUpdate({ trigger: 'cron-5pm' }), { timezone: TIMEZONE });
  scheduled = [tenAm, fivePm];
  console.log('[priceUpdate] scheduler armed for 10:00 and 17:00 Asia/Kolkata');
}

export function stopPriceUpdateScheduler() {
  scheduled.forEach(t => t.stop());
  scheduled = [];
}
