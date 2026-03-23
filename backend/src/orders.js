/**
 * Orders store - SQLite-free for minimal deps. Uses JSON file.
 * In production you'd use SQLite/Postgres.
 */
const fs = require('fs');
const path = require('path');

const ORDERS_FILE = path.join(__dirname, '../../data/orders.json');

function ensureDataDir() {
  const dir = path.dirname(ORDERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');
}

function loadOrders() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  ensureDataDir();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function createOrder(product, priceUsd, addresses, expectedAmounts) {
  const orders = loadOrders();
  const id = 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const order = {
    id,
    product,
    price_usd: parseFloat(priceUsd),
    status: 'pending',
    created_at: new Date().toISOString(),
    addresses: { btc: addresses.btc?.address, eth: addresses.eth?.address, usdc: addresses.usdc?.address },
    expected: expectedAmounts,
    deposit_refid: null
  };
  orders.push(order);
  saveOrders(orders);
  return order;
}

function getOrder(id) {
  return loadOrders().find(o => o.id === id);
}

function markOrderPaid(id, refid) {
  const orders = loadOrders();
  const i = orders.findIndex(o => o.id === id);
  if (i >= 0) {
    orders[i].status = 'paid';
    orders[i].paid_at = new Date().toISOString();
    orders[i].deposit_refid = refid;
    saveOrders(orders);
    return orders[i];
  }
  return null;
}

function getPendingOrders() {
  return loadOrders().filter(o => o.status === 'pending');
}

module.exports = { createOrder, getOrder, markOrderPaid, getPendingOrders };
