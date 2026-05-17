// Fetches international spot rates and converts to INR per gram for gold + silver.
// Source: metalpriceapi.com (base=USD, currencies=XAU,XAG,INR).
// Formula matches admin spreadsheet: USD/oz / 31.1035 * USD_INR * (1 + duty%) * (1 + GST%)

const TROY_OZ_TO_GRAM = 31.1035;
const METALPRICE_BASE_URL = process.env.METALPRICE_BASE_URL || 'https://api.metalpriceapi.com/v1/latest';

export async function fetchMetalPriceQuote(apiKey) {
  if (!apiKey) throw new Error('METALPRICE_API_KEY missing');
  const url = `${METALPRICE_BASE_URL}?api_key=${encodeURIComponent(apiKey)}&base=USD&currencies=XAU,XAG,INR`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`metalpriceapi HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data?.success || !data?.rates) {
    throw new Error(`metalpriceapi error: ${JSON.stringify(data).slice(0, 300)}`);
  }
  const { XAU, XAG, INR } = data.rates;
  if (!XAU || !XAG || !INR) {
    throw new Error(`metalpriceapi missing rates: ${JSON.stringify(data.rates)}`);
  }
  // base=USD: rate.XAU = troy oz of gold per 1 USD; rate.INR = INR per 1 USD
  const usdPerOzGold = 1 / XAU;
  const usdPerOzSilver = 1 / XAG;
  const usdInr = INR;
  return { usdPerOzGold, usdPerOzSilver, usdInr };
}

export function computeInrPerGram(usdPerOz, usdInr, importDutyPercent, gstPercent) {
  const usdPerGram = usdPerOz / TROY_OZ_TO_GRAM;
  const inrPerGram = usdPerGram * usdInr;
  const afterDuty = inrPerGram * (1 + Number(importDutyPercent) / 100);
  const afterGst = afterDuty * (1 + Number(gstPercent) / 100);
  return afterGst;
}

// Returns the row-by-row breakdown matching the admin spreadsheet layout.
export function buildBreakdown(usdPerOz, usdInr, importDutyPercent, gstPercent) {
  const usdPerGram = usdPerOz / TROY_OZ_TO_GRAM;
  const inrPerGramRaw = usdPerGram * usdInr;
  const importDutyAmount = inrPerGramRaw * (Number(importDutyPercent) / 100);
  const afterDuty = inrPerGramRaw + importDutyAmount;
  const gstAmount = afterDuty * (Number(gstPercent) / 100);
  const finalRate = afterDuty + gstAmount;
  return {
    intlUsdPerOz: round(usdPerOz, 2),
    troyOzToGram: TROY_OZ_TO_GRAM,
    usdPerGram: round(usdPerGram, 5),
    usdInr: round(usdInr, 4),
    inrPerGramRaw: round(inrPerGramRaw, 4),
    importDutyPercent: Number(importDutyPercent),
    importDutyAmount: round(importDutyAmount, 4),
    afterDuty: round(afterDuty, 4),
    gstPercent: Number(gstPercent),
    gstAmount: round(gstAmount, 4),
    finalRate: round(finalRate, 4),
  };
}

function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
