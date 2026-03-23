#!/bin/bash
# Full verification: $.com real order flow
BASE="${1:-http://64.227.11.50}"
set -e
echo "=== $.com verification ==="
echo "URL: $BASE"
echo ""

echo "1. Pages"
for p in "" "/download.html" "/pay.html"; do
  code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE$p")
  echo "   $BASE$p → $code"
done

echo ""
echo "2. Images"
for img in img/hero.jpg img/logo.svg; do
  code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/$img" 2>/dev/null || echo "000")
  echo "   /$img → $code"
done

echo ""
echo "3. Create order (Platinum Executive \$350)"
ORD=$(curl -s -X POST "$BASE/api/orders" -H "Content-Type: application/json" -d '{"product":"Platinum Executive","price":350}')
ID=$(echo "$ORD" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
echo "   Order ID: $ID"
echo "   Expected BTC: $(echo "$ORD" | python3 -c "import json,sys; print(json.load(sys.stdin).get('expected',{}).get('btc',''))" 2>/dev/null)"

echo ""
echo "4. Order status"
curl -s "$BASE/api/orders/$ID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"   Status: {d.get('status')}\")
print(f\"   Addresses: BTC={d.get('addresses',{}).get('btc','')[:20]}...\")" 2>/dev/null

echo ""
echo "5. Pay page with order"
echo "   Open: $BASE/pay.html?product=Platinum%20Executive&price=350"
echo "   - Creates order"
echo "   - Shows addresses + expected amounts"
echo "   - Polls for payment every 5s"
echo "   - When paid → Download button appears"

echo ""
echo "6. Deposit verification (Kraken)"
echo "   Send the exact expected amount (BTC/ETH/USDC) to the address"
echo "   Server polls Kraken DepositStatus every 60s"
echo "   When deposit matches → order marked paid → download unlocks"
