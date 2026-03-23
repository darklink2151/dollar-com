#!/bin/bash
# Run on droplet to set up and start dollar-com
set -e
source /home/d/.config/api-keys.env 2>/dev/null || true

# Create env file (keys passed as args or from env)
mkdir -p /opt/dollar-com/backend
cat > /opt/dollar-com/backend/.env << ENV
PORT=8080
KRAKEN_API_KEY=${KRAKEN_API_KEY:-}
KRAKEN_API_SECRET=${KRAKEN_API_SECRET:-}
ENV

# Systemd service
cat > /etc/systemd/system/dollar-com.service << 'SVC'
[Unit]
Description=dollar-com log-store crypto site
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/dollar-com/backend
EnvironmentFile=/opt/dollar-com/backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable dollar-com
systemctl restart dollar-com
