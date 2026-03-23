const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { getDepositAddresses } = require('./kraken-deposits');
require('dotenv').config();

const path = require('path');
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, '../..')));

// Kraken deposit addresses — dynamic, live from API
app.get('/api/crypto/deposit-addresses', async (req, res) => {
  try {
    const addresses = await getDepositAddresses();
    res.json(addresses);
  } catch (err) {
    console.error('[Kraken]', err);
    res.status(500).json({ error: err.message || 'Failed to fetch deposit addresses' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[$.com] Financial Gateway listening securely on port ${PORT}`);
});
