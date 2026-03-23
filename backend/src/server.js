const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const { getDepositAddresses } = require('./kraken-deposits');
require('dotenv').config();

const path = require('path');
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Serve frontend (log-store style)
app.use(express.static(path.join(__dirname, '../..')));

// Kraken deposit addresses (Option B - dynamic)
app.get('/api/crypto/deposit-addresses', async (req, res) => {
  try {
    const addresses = await getDepositAddresses();
    res.json(addresses);
  } catch (err) {
    console.error('[Kraken]', err);
    res.status(500).json({ error: err.message || 'Failed to fetch deposit addresses' });
  }
});

// Initialize robust PostgreSQL Connection Pool
const pool = new Pool({
  user: process.env.DB_USER || 'admin',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'dollar_ledger',
  password: process.env.DB_PASSWORD || 'secret',
  port: process.env.DB_PORT || 5432,
});

// Initialize high-speed Redis Client for Idempotency
const redisClient = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// Idempotent Transaction Endpoint (Double-Entry Ledger Demo)
app.post('/api/transaction/transfer', async (req, res) => {
  const { fromAccount, toAccount, amount, idempotencyKey } = req.body;
  
  if (!idempotencyKey) return res.status(400).json({ error: 'Idempotency key required' });

  try {
    const cachedResponse = await redisClient.get(`idemp_${idempotencyKey}`);
    if (cachedResponse) {
      return res.status(200).json(JSON.parse(cachedResponse));
    }

    const client = await pool.connect();
    try {
      // Serializable isolation to prevent ALL race conditions
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      
      // Debit source (parameterized query)
      await client.query(
        'UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1',
        [amount, fromAccount]
      );

      // Credit destination (parameterized query)
      await client.query(
        'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
        [amount, toAccount]
      );

      // Record atomic double-entry ledger logs
      await client.query(
        'INSERT INTO ledger_entries (account_id, amount, type) VALUES ($1, $2, $3)',
        [fromAccount, -amount, 'DEBIT']
      );
      await client.query(
        'INSERT INTO ledger_entries (account_id, amount, type) VALUES ($1, $2, $3)',
        [toAccount, amount, 'CREDIT']
      );

      await client.query('COMMIT');
      
      const successPayload = { status: 'Success', amount, fromAccount, toAccount, transactionId: uuidv4() };
      
      // Cache success payload mapping against idempotency key for 24h
      await redisClient.setEx(`idemp_${idempotencyKey}`, 86400, JSON.stringify(successPayload));
      
      res.status(200).json(successPayload);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Transaction failed:', error);
    res.status(500).json({ status: 'Error', message: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`[$.com] Financial Gateway listening securely on port ${PORT}`);
});
