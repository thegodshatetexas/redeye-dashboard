#!/usr/bin/env bash
# =============================================================================
# deploy-with-ssm.sh — Deploy redeye-dashboard pulling secrets from SSM
# =============================================================================
# Usage:
#   ./scripts/deploy-with-ssm.sh
# =============================================================================

set -euo pipefail

APP_DIR="/var/www/dashboard.redeye.dev"
PM2_NAME="dashboard-redeye"
REGION="${AWS_REGION:-us-west-2}"
PREFIX="/redeye/dashboard"

echo "🚀 Deploying $PM2_NAME..."

ssh redeye-new bash -s << EOF
set -euo pipefail

echo "📦 Pulling latest code..."
cd $APP_DIR
git pull origin main

echo "📥 Installing dependencies..."
npm install --prefer-offline

echo "🔐 Fetching secrets from SSM..."
aws ssm get-parameters-by-path \
  --region $REGION \
  --path $PREFIX \
  --with-decryption \
  --recursive \
  --query "Parameters[*].[Name,Value]" \
  --output text \
  --no-cli-pager | while IFS=\$'\t' read -r NAME VALUE; do
    KEY="\${NAME##*/}"
    echo "\${KEY}=\${VALUE}"
  done > .env.production.local

echo "🔨 Building..."
npm run build

echo "♻️  Restarting PM2..."
pm2 restart $PM2_NAME --update-env

echo "✅ Deploy complete."
pm2 list | grep $PM2_NAME
EOF
