/**
 * $.com — log-store style. Fetches Kraken deposit addresses, displays QR codes.
 * Products: fake items for sale, pay with crypto to Kraken.
 */
const API_BASE = ''; // same origin when served by backend on :8000

async function fetchAddresses() {
  const url = `${API_BASE}/api/crypto/deposit-addresses`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text() || res.statusText);
  return res.json();
}

function copyAddress(addr, btn) {
  navigator.clipboard.writeText(addr).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

function renderQR(container, text) {
  if (typeof QRCode !== 'undefined') {
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, text, { width: 160 }, (err) => {
      if (!err) container.appendChild(canvas);
    });
  }
}

async function init() {
  const listEl = document.getElementById('address-list');
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');

  try {
    const data = await fetchAddresses();
    loadingEl.style.display = 'none';

    if (data.error && !data.btc && !data.eth && !data.usdc) {
      errorEl.textContent = data.error;
      errorEl.style.display = 'block';
      return;
    }

    const items = [
      ['btc', data.btc],
      ['eth', data.eth],
      ['usdc', data.usdc]
    ].filter(([, v]) => v && v.address);

    if (items.length === 0) {
      errorEl.textContent = 'No deposit addresses available.';
      errorEl.style.display = 'block';
      return;
    }

    listEl.innerHTML = items.map(([key, info]) => {
      const qrId = `qr-${key}`;
      return `
        <div class="address-card">
          <h4>${info.asset} (${info.network})</h4>
          <div class="address-row">
            <div class="qr-container" id="${qrId}"></div>
            <div class="address-details">
              <div class="address-value">${info.address}</div>
              <button class="copy-btn" data-addr="${info.address}">Copy address</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    listEl.style.display = 'block';

    items.forEach(([key, info]) => {
      const qrEl = document.getElementById(`qr-${key}`);
      if (qrEl) renderQR(qrEl, info.address);
    });

    listEl.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => copyAddress(btn.dataset.addr, btn));
    });
  } catch (err) {
    loadingEl.style.display = 'none';
    errorEl.textContent = err.message || 'Failed to load addresses';
    errorEl.style.display = 'block';
  }
}

function setupProductHandlers() {
  const buyBtns = document.querySelectorAll('.buy-btn');
  const orderSummary = document.getElementById('order-summary');
  const orderProduct = document.getElementById('order-product');
  const orderPrice = document.getElementById('order-price');

  buyBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const product = btn.dataset.product || 'Item';
      const price = btn.dataset.price || '0';
      if (orderSummary && orderProduct && orderPrice) {
        orderProduct.textContent = product;
        orderPrice.textContent = '$' + price;
        orderSummary.style.display = 'block';
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupProductHandlers();
  init();
});
