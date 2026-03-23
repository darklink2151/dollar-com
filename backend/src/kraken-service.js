/**
 * Kraken: addresses, ticker prices, deposit status
 */
const Kraken = require('node-kraken-api').Kraken;

function getClient() {
  const key = process.env.KRAKEN_API_KEY;
  const secret = process.env.KRAKEN_API_SECRET;
  if (!key || !secret) throw new Error('KRAKEN_API_KEY and KRAKEN_API_SECRET required');
  return new Kraken({ key, secret });
}

const ASSET_CFG = [
  { asset: 'XBT', method: 'Bitcoin', label: 'btc' },
  { asset: 'ETH', method: null, label: 'eth' },
  { asset: 'USDC', method: null, label: 'usdc' }
];

async function getDepositAddresses() {
  const k = getClient();
  const out = { btc: null, eth: null, usdc: null };
  for (const c of ASSET_CFG) {
    let method = c.method;
    if (!method) {
      const m = await k.depositMethods({ asset: c.asset });
      const arr = m?.result ?? (Array.isArray(m) ? m : []);
      method = arr[0]?.method || null;
    }
    if (!method) continue;
    const r = await k.depositAddresses({ asset: c.asset, method, new: false });
    const res = r?.result ?? r;
    const list = Array.isArray(res) ? res : (res?.address ? [res] : []);
    if (list[0]?.address) {
      out[c.label] = {
        address: list[0].address,
        network: list[0].method || c.asset,
        asset: c.asset.replace('XBT', 'BTC')
      };
    }
  }
  return out;
}

/** Get USD pair price: XXBTZUSD, XETHZUSD */
async function getTickerPrices() {
  try {
    const k = getClient();
    const pairs = ['XXBTZUSD', 'XETHZUSD'];
    const r = await k.ticker({ pair: pairs.join(',') });
    const result = r?.result ?? r;
    const prices = {};
    if (result?.XXBTZUSD?.c) prices.btc = parseFloat(result.XXBTZUSD.c[0]);
    if (result?.XETHZUSD?.c) prices.eth = parseFloat(result.XETHZUSD.c[0]);
    prices.usdc = 1;
    return prices;
  } catch (e) {
    return { btc: 97000, eth: 3500, usdc: 1 };
  }
}

/** Compute expected crypto amounts for a USD price */
async function getExpectedAmounts(priceUsd) {
  const prices = await getTickerPrices();
  const p = parseFloat(priceUsd);
  return {
    btc: (p / (prices.btc || 97000)).toFixed(8),
    eth: (p / (prices.eth || 3500)).toFixed(6),
    usdc: p.toFixed(2)
  };
}

/** Get recent deposits - for matching to orders */
async function getRecentDeposits() {
  try {
    const k = getClient();
    const r = await k.depositStatus({});
    const arr = r?.result ?? (Array.isArray(r) ? r : []);
    return arr.filter(d => (d.status === 'Success' || d.status === 'Settled'));
  } catch (e) {
    return [];
  }
}

module.exports = {
  getDepositAddresses,
  getTickerPrices,
  getExpectedAmounts,
  getRecentDeposits
};
