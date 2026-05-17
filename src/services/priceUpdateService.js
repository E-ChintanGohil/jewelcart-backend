import { PrismaClient } from '@prisma/client';
import { fetchMetalPriceQuote, computeInrPerGram, buildBreakdown } from './rateService.js';
import MaterialService from './materialService.js';
import ProductService from './productService.js';

const prisma = new PrismaClient();

export async function runPriceUpdate({ trigger = 'manual' } = {}) {
  const startedAt = new Date();
  const settings = await prisma.siteSetting.findFirst();
  if (!settings) {
    return { ok: false, error: 'No site settings row found' };
  }

  const apiKey = settings.metalPriceApiKey || process.env.METALPRICE_API_KEY;
  if (!apiKey) {
    const msg = 'metalpriceapi key missing (settings.metalPriceApiKey or METALPRICE_API_KEY env)';
    await persistStatus(settings.id, msg, null, null);
    return { ok: false, error: msg };
  }

  try {
    const { usdPerOzGold, usdPerOzSilver, usdInr } = await fetchMetalPriceQuote(apiKey);
    const duty = Number(settings.importDutyPercent ?? 6);
    const gst = Number(settings.gstOnMetalPercent ?? 3);

    const goldBreakdown = buildBreakdown(usdPerOzGold, usdInr, duty, gst);
    const silverBreakdown = buildBreakdown(usdPerOzSilver, usdInr, duty, gst);
    const goldInrPerGram = Math.round(goldBreakdown.finalRate);
    const silverInrPerGram = Math.round(silverBreakdown.finalRate);

    const karatsUpdated = await MaterialService.updateAllKaratPrices(goldInrPerGram, silverInrPerGram);
    const productsUpdated = await ProductService.updateAllPrices();

    const status = `OK ${trigger} | gold=${goldInrPerGram} silver=${silverInrPerGram} karats=${karatsUpdated} products=${productsUpdated}`;
    await prisma.siteSetting.update({
      where: { id: settings.id },
      data: {
        goldPrice: goldInrPerGram,
        silverPrice: silverInrPerGram,
        lastPriceUpdateAt: startedAt,
        lastGoldRateInr: goldInrPerGram,
        lastSilverRateInr: silverInrPerGram,
        lastPriceUpdateStatus: status,
        lastPriceBreakdown: { trigger, at: startedAt.toISOString(), gold: goldBreakdown, silver: silverBreakdown },
      },
    });
    console.log(`[priceUpdate] ${status}`);
    return { ok: true, goldInrPerGram, silverInrPerGram, karatsUpdated, productsUpdated };
  } catch (err) {
    const msg = `FAIL ${trigger} | ${err.message || String(err)}`;
    console.error('[priceUpdate]', msg);
    await persistStatus(settings.id, msg, null, null);
    return { ok: false, error: err.message || String(err) };
  }
}

async function persistStatus(id, status, gold, silver) {
  try {
    await prisma.siteSetting.update({
      where: { id },
      data: {
        lastPriceUpdateAt: new Date(),
        lastPriceUpdateStatus: status,
        ...(gold != null ? { lastGoldRateInr: gold } : {}),
        ...(silver != null ? { lastSilverRateInr: silver } : {}),
      },
    });
  } catch (e) {
    console.error('[priceUpdate] failed to persist status', e.message);
  }
}
