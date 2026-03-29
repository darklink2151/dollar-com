(function () {
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c;
    });
  }

  (async () => {
    const list = document.getElementById('product-list');
    if (!list) return;

    try {
      const res = await fetch('/api/products');
      const products = await res.json();

      if (!Array.isArray(products) || products.length === 0) {
        list.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">No products available.</td></tr>';
        return;
      }

      list.innerHTML = products.map((p, index) => {
        return `
          <tr>
            <td>${esc(p.id)}</td>
            <td><span class="badge-status">${esc(p.status)}</span></td>
            <td><span class="type-cell">${esc(p.type)}</span></td>
            <td><span class="includes-cell">${esc(p.includes)}</span></td>
            <td><span class="balance-cell">${esc(p.balance)}</span></td>
            <td><span class="price-cell">${esc(p.raw_price)}</span></td>
            <td>
              <a href="pay.html?product=${encodeURIComponent(p.name)}&price=${encodeURIComponent(p.price)}" class="make-order-btn">Make Order</a>
            </td>
          </tr>
        `;
      }).join('');

    } catch (e) {
      list.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #f87171;">Failed to load secure database.</td></tr>';
    }
  })();
})();
