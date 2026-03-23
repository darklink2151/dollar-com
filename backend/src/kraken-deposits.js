/**
 * Kraken deposit addresses API
 * Fetches BTC, ETH, USDC deposit addresses from Kraken
 * Keys: KRAKEN_API_KEY, KRAKEN_API_SECRET or KRAKEN_CONFIG_PATH
 */
const fs = require('fs');
const path = require('path');

let Kraken;
try {
  Kraken = require('node-kraken-api').Kraken;
} catch (e) {
  Kraken = null;
}

function loadKrakenKeys() {
  const key = process.env.KRAKEN_API_KEY;
  const secret = process.env.KRAKEN_API_SECRET;
  if (key && secret) return { key, secret };

  const configPath = process.env.KRAKEN_CONFIG_PATH ||
    path.join(__dirname, '../../..', 'phase2', 'crypto', 'config', 'kraken_api_keys.json');
  if (fs.existsSync(configPath)) {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      key: data?.api_keys?.api_key,
      secret: data?.api_keys?.api_secret
    };
  }
  return null;
}

const ASSET_CONFIG = [
  { asset: 'XBT', method: 'Bitcoin', label: 'BTC', network: 'Bitcoin' },
  { asset: 'ETH', method: null, label: 'ETH', network: 'Ethereum' },
  { asset: 'USDC', method: null, label: 'USDC', network: null }
];

async function getDepositAddresses() {
  if (!Kraken) throw new Error('node-kraken-api not installed');
  const creds = loadKrakenKeys();
  const results = { btc: null, eth: null, usdc: null, error: null };
  
  if (!creds?.key || !creds?.secret) {
    results.error = 'KRAKEN_API_KEY and KRAKEN_API_SECRET required. Set in .env or env vars.';
    return results;
  }

  const kraken = new Kraken({ key: creds.key, secret: creds.secret });

  for (const cfg of ASSET_CONFIG) {
    try {
      let method = cfg.method;
      if (!method) {
        const methodsRes = await kraken.depositMethods({ asset: cfg.asset });
        const arr = methodsRes?.result ?? (Array.isArray(methodsRes) ? methodsRes : []);
        const first = arr[0];
        method = first?.method || null;
      }
      if (!method) continue;

      const addrRes = await kraken.depositAddresses({
        asset: cfg.asset,
        method,
        new: false
      });
      const res = addrRes?.result ?? addrRes;
      const list = Array.isArray(res) ? res : (res && res.address ? [res] : []);
      const first = list[0];
      if (first?.address) {
        results[cfg.label.toLowerCase()] = {
          address: first.address,
          network: cfg.network || method,
          asset: cfg.label
        };
      }
    } catch (err) {
      results.error = results.error || err.message;
    }
  }
  return results;
}

module.exports = { getDepositAddresses, loadKrakenKeys };
