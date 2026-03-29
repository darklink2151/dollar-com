/**
 * QuantumShade Pay page — create order, show addresses, poll for payment, deliver download
 */
const API = typeof window !== 'undefined' ? window.location.origin : '';

async function api(path, opts) {
  const r = await fetch(API + path, opts);
  if (!r.ok) throw new Error(await r.text().catch(() => r.statusText));
  return r.json();
}

function copyAddress(addr, btn) {
  navigator.clipboard.writeText(addr).then(() => {
    const o = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = o; }, 2000);
  });
}

function renderQR(el, text) {
  if (typeof QRCode === 'undefined' || !el) return;
  el.innerHTML = '';
  const c = document.createElement('canvas');
  QRCode.toCanvas(c, text, { width: 160 }, (err) => { if (!err) el.appendChild(c); });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}

async function initPayPage() {
  const listEl = document.getElementById('address-list');
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const orderEl = document.getElementById('order-summary');
  const downloadEl = document.getElementById('download-area');
  if (!listEl || !loadingEl) return;

  const params = new URLSearchParams(window.location.search);
  const product = params.get('product');
  const price = params.get('price');

  if (product && price && orderEl) {
    orderEl.textContent = `${product} — $${price}`;
    orderEl.style.display = 'block';
  }

  try {
    if (!product || !price) {
      const data = await api('/api/crypto/deposit-addresses');
      const items = [['btc', data.btc], ['eth', data.eth], ['usdc', data.usdc]].filter(([, v]) => v?.address);
      if (data.error && items.length === 0) throw new Error(data.error);
      if (items.length === 0) throw new Error('No addresses');
      loadingEl.style.display = 'none';
      listEl.innerHTML = items.map(([k, info]) => `
        <div class="address-card">
          <h4>${esc(info.asset)} (${esc(info.network || k)})</h4>
          <div class="address-row">
            <div class="qr-container" id="qr-${k}"></div>
            <div class="address-details">
              <div class="address-value">${esc(info.address)}</div>
              <button class="copy-btn" data-addr="${esc(info.address)}">Copy</button>
            </div>
          </div>
        </div>
      `).join('');
      listEl.style.display = 'block';
      items.forEach(([k, info]) => { const e = document.getElementById(`qr-${k}`); if (e) renderQR(e, info.address); });
      listEl.querySelectorAll('.copy-btn').forEach(b => b.addEventListener('click', () => copyAddress(b.dataset.addr, b)));
      return;
    }

    const order = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, price })
    });

    const addrs = order.addresses || {};
    const expected = order.expected || {};
    const network = order.network || {};
    const items = [
      ['btc', addrs.btc, 'BTC', network.btc || 'Bitcoin', expected.btc],
      ['eth', addrs.eth, 'ETH', network.eth || 'Ethereum', expected.eth],
      ['usdc', addrs.usdc, 'USDC', network.usdc || 'USDC', expected.usdc]
    ].filter(([, a]) => a);

    if (items.length === 0) {
      loadingEl.style.display = 'none';
      if (errorEl) { errorEl.textContent = 'No deposit addresses available.'; errorEl.style.display = 'block'; }
      return;
    }

    loadingEl.style.display = 'none';
    listEl.innerHTML = items.map(([k, addr, asset, net, exp]) => `
      <div class="address-card">
        <h4>${esc(asset)} (${esc(net)})</h4>
        ${exp ? `<p class="expected-amount">Send: <strong>${esc(exp)}</strong> ${asset}</p>` : ''}
        <div class="address-row">
          <div class="qr-container" id="qr-${k}"></div>
          <div class="address-details">
            <div class="address-value">${esc(addr)}</div>
            <button class="copy-btn" data-addr="${esc(addr)}">Copy</button>
          </div>
        </div>
      </div>
    `).join('');
    listEl.style.display = 'block';

    items.forEach(([k, addr]) => {
      const el = document.getElementById(`qr-${k}`);
      if (el) renderQR(el, addr);
    });
    listEl.querySelectorAll('.copy-btn').forEach(b => {
      b.addEventListener('click', () => copyAddress(b.dataset.addr, b));
    });

    const orderId = order.id;
    const poll = () => {
      api(`/api/orders/${orderId}`).then(o => {
        if (o.status === 'paid') {
          if (downloadEl) {
            downloadEl.innerHTML = `
              <div class="paid-banner">
                <strong>Payment received!</strong>
                <a href="${API}/api/orders/${orderId}/download" class="cta download-btn">Download ${esc(product)}</a>
              </div>
            `;
            downloadEl.style.display = 'block';
          }
          return;
        }
        setTimeout(poll, 5000);
      }).catch(() => setTimeout(poll, 10000));
    };
    setTimeout(poll, 5000);
  } catch (err) {
    loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = err.message || 'Failed to create order.';
      errorEl.style.display = 'block';
    }
  }
}

if (document.getElementById('crypto-addresses')) {
  document.addEventListener('DOMContentLoaded', initPayPage);
}
