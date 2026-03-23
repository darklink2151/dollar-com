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

## Features (log-store aesthetic)

- **Products**: Fake items for sale (Starter $29, Pro $99, Enterprise $499, S3 Connector $49)
- Schemaless, Parse with Python, Self-Hosted, Zero-Dependencies
- Dark, minimal, JetBrains Mono
- Dynamic Kraken deposit addresses — crypto sent goes to your Kraken
- QR codes + Copy address
