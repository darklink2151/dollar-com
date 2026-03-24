#!/bin/bash
# Deploy dollar_com to droplet. Run: ./deploy/rsync-deploy.sh
# Requires: DROPLET_USER and DROPLET_HOST env or edit below
DROPLET="${DROPLET_USER:-root}@${DROPLET_HOST:-64.227.11.50}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Deploying $ROOT to $DROPLET:/opt/dollar-com"
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='data/orders.json' --exclude='backend/.env' \
  "$ROOT/" "$DROPLET:/opt/dollar-com/"
ssh "$DROPLET" "systemctl restart dollar-com 2>/dev/null || true"
echo "Done. Verify: curl -s http://64.227.11.50/api/products | head -200"
