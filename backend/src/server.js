const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const kraken = require('./kraken-service');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());
app.use(express.json());
app.use(cors());

// General rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Tighter limit for order creation
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 order creations per hour
  message: { error: 'Too many orders created. Please contact support if this is an error.' }
});

const staticRoot = path.join(__dirname, '../..');
const cache = process.env.NODE_ENV === 'production' ? '7d' : 0;
app.use('/css', express.static(path.join(staticRoot, 'css'), { maxAge: cache }));
app.use('/js', express.static(path.join(staticRoot, 'js'), { maxAge: cache }));
app.use('/img', express.static(path.join(staticRoot, 'img'), { maxAge: cache }));
app.use(express.static(staticRoot));

/** Products catalog */
const productsPath = path.join(__dirname, '../../data/products.json');
function getProducts() {
  try {
    return JSON.parse(require('fs').readFileSync(productsPath, 'utf8'));
  } catch {
    return [];
  }
}
app.get('/api/products', (req, res) => res.json(getProducts()));

/** Create order, return id + addresses + expected amounts */
app.post('/api/orders', async (req, res) => {
  try {
    const { product, price } = req.body || {};
    const priceUsd = parseFloat(price) || 0;
    if (!product || priceUsd <= 0) {
      return res.status(400).json({ error: 'product and price required' });
    }
    const [addresses, expected] = await Promise.all([
      kraken.getDepositAddresses(),
      kraken.getExpectedAmounts(priceUsd)
    ]);
    const order = await db.createOrder(product, priceUsd, addresses, expected);
    const network = {
      btc: addresses.btc?.network || 'Bitcoin',
      eth: addresses.eth?.network || 'Ethereum',
      usdc: addresses.usdc?.network || 'USDC'
    };
    res.json({
      id: order.id,
      product: order.product,
      price_usd: order.price_usd,
      status: order.status,
      addresses: order.addresses,
      expected,
      network
    });
  } catch (err) {
    console.error('[orders]', err);
    res.status(500).json({ error: err.message || 'Order failed' });
  }
});

/** Get order status */
app.get('/api/orders/:id', async (req, res) => {
  const order = await db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({
    id: req.params.id,
    product: order.product,
    price_usd: order.priceUsd,
    status: order.status,
    addresses: order.addresses,
    expected: order.expectedAmounts,
    network: order.addresses
      ? {
          btc: 'Bitcoin',
          eth: 'Ethereum',
          usdc: 'USDC'
        }
      : null,
    paid_at: order.paid_at
  });
});

/** Download product when paid */
app.get('/api/orders/:id/download', async (req, res) => {
  const order = await db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'paid') {
    return res.status(402).json({ error: 'Payment required', status: order.status });
  }
  const product = order.product || 'Logs';
  const lines = [
    `# ${product} - QuantumShade`,
    `# Generated for Order: ${req.params.id}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
    ...Array.from({ length: 50 }, (_, i) => {
      const ts = new Date(Date.now() - i * 60000).toISOString();
      const level = ['INFO', 'WARN', 'DEBUG'][i % 3];
      const msg = `log entry ${1000 + i} ${level.toLowerCase()}`;
      return `${ts}\t${level}\t${msg}\t{"row":${i}}`;
    })
  ];
  const body = lines.join('\n');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${product.replace(/\s+/g, '-')}-${req.params.id}.log"`);
  res.send(body);
});

/** Shared addresses (pay page without product/order) */
app.get('/api/crypto/deposit-addresses', async (req, res) => {
  try {
    const addresses = await kraken.getDepositAddresses();
    res.json({
      btc: addresses.btc,
      eth: addresses.eth,
      usdc: addresses.usdc,
      error: null
    });
  } catch (err) {
    console.error('[Kraken]', err);
    res.status(500).json({ error: err.message || 'Failed' });
  }
});

/** Poll deposits, match to orders, mark paid */
async function pollDeposits() {
  try {
    const deposits = await kraken.getRecentDeposits();
    const pending = await db.getPendingOrders();
    for (const dep of deposits) {
      const amt = parseFloat(dep.amount);
      const asset = (dep.asset || '').toUpperCase().replace('XBT', 'BTC');
      const refid = dep.refid || dep.txid;
      for (const ord of pending) {
        const exp = ord.expectedAmounts || {};
        const key = asset === 'BTC' ? 'btc' : asset === 'ETH' ? 'eth' : asset === 'USDC' ? 'usdc' : null;
        if (!key || !exp[key]) continue;
        const expVal = parseFloat(exp[key]);
        const tol = Math.max(expVal * 0.01, 0.00000001);
        if (Math.abs(amt - expVal) <= tol) {
          await db.markOrderPaid(ord.id, refid);
          console.log(`[deposit] Order ${ord.id} marked paid (${amt} ${asset})`);
          break;
        }
      }
    }
  } catch (e) {
    console.error('[deposit poll]', e.message);
  }
}

setInterval(pollDeposits, 60000);
pollDeposits();

const PORT = parseInt(process.env.PORT, 10) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[QuantumShade] Listening on 0.0.0.0:${PORT}`);
});
