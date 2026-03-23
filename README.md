# $.com — log-store style + crypto

Minimalist site inspired by [log-store.com](https://log-store.com). Accept crypto (BTC, ETH, USDC) via Kraken deposit addresses.

## Rules (Antigravity / Cursor)

- **`.cursor/rules/universal.mdc`** → symlink to `/home/d/.cursor/rules.mdc` (Cursor)
- **`AGENTS.md`** → cross-tool rules (Antigravity, Cursor, Claude)
- **`.agdirectives`** → Antigravity native directives

When you open `dollar_com` in Antigravity or Cursor, these rules apply automatically.

## Quick start

```bash
cd /home/d/dollar_com/backend
npm install
# Kraken keys: uses phase2/crypto/config/kraken_api_keys.json by default
npm start
```

Open http://localhost:8000 — frontend + `/api/crypto/deposit-addresses`

## Live on DigitalOcean

- **URL:** http://64.227.11.50
- **Cost:** ~\$4/mo (s-1vcpu-512mb-10gb droplet)
- **Stack:** nginx (port 80) → Node (8080), Kraken API dynamic
- **Kraken:** Live addresses from your account, no fallback

## Features (log-store style)

- **Multi-page**: Home, Download, Pay — like log-store.com
- **Images**: Hero, feature blocks, product cards with photos
- Schemaless, Parse with Python, Self-Hosted, Zero-Dependencies
- Pay page: deposit addresses only (funds go to your account)
