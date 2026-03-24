const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { createOrder, getOrder, markOrderPaid, getPendingOrders } = require('./orders');
const kraken = require('./kraken-service');
require('dotenv').config();

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../..')));

/** Database Pool */
const pool = new Pool({
  user: process.env.DB_USER || 'admin',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'dollar_ledger',
  password: process.env.DB_PASSWORD || 'secretpassword',
  port: process.env.DB_PORT || 5432,
});

/** Products catalog */
const productsPath = path.join(__dirname, '../../data/products.json');
function getProducts() {
  try {
    return JSON.parse(require('fs').readFileSync(productsPath, 'utf8'));
  } catch { return []; }
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
    const order = createOrder(product, priceUsd, addresses, expected);
    const network = { btc: addresses.btc?.network || 'Bitcoin', eth: addresses.eth?.network || 'Ethereum', usdc: addresses.usdc?.network || 'USDC' };
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
app.get('/api/orders/:id', (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({
    id: order.id,
    product: order.product,
    price_usd: order.price_usd,
    status: order.status,
    addresses: order.addresses,
    expected: order.expected,
    network: order.addresses ? {
      btc: 'Bitcoin',
      eth: 'Ethereum',
      usdc: 'USDC'
    } : null,
    paid_at: order.paid_at
  });
});

/** Download product when paid */
app.get('/api/orders/:id/download', (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'paid') {
    return res.status(402).json({ error: 'Payment required', status: order.status });
  }
  const product = order.product || 'Logs';
  const lines = [
    `# ${product} - $.com`,
    `# Order: ${order.id}`,
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
  res.setHeader('Content-Disposition', `attachment; filename="${product.replace(/\s+/g, '-')}-${order.id}.log"`);
  res.send(body);
});

/** Ledger Transaction API */
app.post('/api/transaction/transfer', async (req, res) => {
  const { fromAccount, toAccount, amount, idempotencyKey } = req.body || {};
  if (!fromAccount || !toAccount || !amount) {
    return res.status(400).json({ error: 'fromAccount, toAccount, and amount required' });
  }
  const floatAmt = parseFloat(amount);
  if (isNaN(floatAmt) || floatAmt <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check sender balance
    const senderRes = await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance',
      [floatAmt, fromAccount]
    );

    if (senderRes.rowCount === 0) {
      throw new Error('Insufficient funds or account not found');
    }

    // Update receiver balance
    const receiverRes = await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING balance',
      [floatAmt, toAccount]
    );

    if (receiverRes.rowCount === 0) {
      // Create recipient if not exists (per user request flow)
      await client.query(
        'INSERT INTO accounts (id, owner_id, balance, currency) VALUES ($1, $2, $3, $4)',
        [toAccount, 'user', floatAmt, 'USD']
      );
    }

    // Log to ledger
    await client.query(
      'INSERT INTO ledger_entries (account_id, amount, type, reference_id) VALUES ($1, $2, $3, $4)',
      [fromAccount, floatAmt, 'DEBIT', idempotencyKey || null]
    );
    await client.query(
      'INSERT INTO ledger_entries (account_id, amount, type, reference_id) VALUES ($1, $2, $3, $4)',
      [toAccount, floatAmt, 'CREDIT', idempotencyKey || null]
    );

    await client.query('COMMIT');
    res.json({ success: true, from: fromAccount, to: toAccount, amount: floatAmt, transaction_id: idempotencyKey || `tx_${Date.now()}` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[transfer-error]', err.message);
    res.status(500).json({ error: err.message || 'Transfer failed' });
  } finally {
    client.release();
  }
});

/** Poll deposits, match to orders, mark paid */
async function pollDeposits() {
  try {
    const deposits = await kraken.getRecentDeposits();
    const pending = getPendingOrders();
    for (const dep of deposits) {
      const amt = parseFloat(dep.amount);
      const asset = (dep.asset || '').toUpperCase().replace('XBT', 'BTC');
      const refid = dep.refid || dep.txid;
      for (const ord of pending) {
        const exp = ord.expected || {};
        const key = asset === 'BTC' ? 'btc' : asset === 'ETH' ? 'eth' : asset === 'USDC' ? 'usdc' : null;
        if (!key || !exp[key]) continue;
        const expVal = parseFloat(exp[key]);
        const tol = Math.max(expVal * 0.01, 0.00000001);
        if (Math.abs(amt - expVal) <= tol) {
          markOrderPaid(ord.id, refid);
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

const PORT = 8000; // Force 8000 as per user history
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[$.com] Financial Server active on port ${PORT}`);
});

