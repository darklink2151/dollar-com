const { Pool } = require('pg');
const Redis = require('ioredis');

// --- DATABASE (Postgres) ---
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'secretpassword',
  database: process.env.DB_NAME || 'dollar_ledger',
  ssl: false // Set to true if using cloud DB with TLS
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('[DB] Connection Error:', err.stack);
  else console.log('[DB] Connected @', res.rows[0].now);
});

// --- CACHE (Redis) ---
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err));

module.exports = {
  // DB Helpers
  query: (text, params) => pool.query(text, params),
  
  // Storage logic
  async createOrder(product, priceUsd, addresses, expectedAmounts) {
    const id = 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    // 1. Save to Redis for fast polling/caching (TTL 24 hours)
    await redis.setex(`order:${id}`, 86400, JSON.stringify({
      product, priceUsd, addresses, expectedAmounts, status: 'pending'
    }));
    
    // 2. Persist to Postgres (Placeholder: You can add an orders table later)
    // For now, we'll use the ledger schema you have to "reserve" space or just use Redis
    // and provide the ID back.
    
    return { id, product, price_usd: priceUsd, status: 'pending', addresses, expected: expectedAmounts };
  },

  async getOrder(id) {
    const data = await redis.get(`order:${id}`);
    return data ? JSON.parse(data) : null;
  },

  async markOrderPaid(id, refid) {
    const data = await redis.get(`order:${id}`);
    if (!data) return null;

    const order = JSON.parse(data);
    if (order.status === 'paid') return order;

    // 1. Transactional Update to Postgres Ledger first
    // If this fails, the order stays 'pending' in Redis, which is safe to retry.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Log the transaction in the ledger
      await client.query(
        'INSERT INTO ledger_entries (account_id, amount, type, reference_id, metadata) VALUES ($1, $2, $3, $4, $5)',
        ['system-hot-wallet', order.priceUsd, 'CREDIT', id, JSON.stringify({ refid, product: order.product })]
      );

      await client.query('COMMIT');

      // 2. Only if Postgres succeeds, update the Cache
      order.status = 'paid';
      order.paid_at = new Date().toISOString();
      order.deposit_refid = refid;
      await redis.set(`order:${id}`, JSON.stringify(order));

      return order;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[DB] Failed to mark order ${id} as paid:`, err);
      throw err;
    } finally {
      client.release();
    }
  },

  async getPendingOrders() {
    // In a real app, you'd scan Redis or query Postgres for status='pending'
    const keys = await redis.keys('order:*');
    const orders = [];
    for (const key of keys) {
      const ord = JSON.parse(await redis.get(key));
      if (ord.status === 'pending') {
        ord.id = key.split(':')[1];
        orders.push(ord);
      }
    }
    return orders;
  }
};
