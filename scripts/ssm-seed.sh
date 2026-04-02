#!/usr/bin/env bash
# =============================================================================
# ssm-seed.sh — ONE-TIME script to push .env.local secrets into AWS SSM
# =============================================================================
# Usage:
#   cd /path/to/redeye-dashboard
#   chmod +x scripts/ssm-seed.sh
#   ./scripts/ssm-seed.sh
#
# Requirements:
#   - AWS CLI configured with credentials that have ssm:PutParameter permission
#   - .env.local file in the current directory
#   - AWS region set (default: us-west-2)
#
# Run this ONCE to seed SSM. After that, use deploy-with-ssm.sh for deploys.
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
PREFIX="/redeye/dashboard"
ENV_FILE="${1:-.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found. Run from the project root."
  exit 1
fi

echo "🌱 Seeding SSM parameters from $ENV_FILE → $PREFIX/ (region: $REGION)"
echo ""

# Keys to push (skip comments, blanks, and SESSION_COOKIE_DOMAIN which is non-secret)
KEYS=(
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  AUTH_SECRET
  AUTH_URL
  AUTH_TRUST_HOST
  NEXTAUTH_SECRET
  NEXTAUTH_URL
  SESSION_COOKIE_DOMAIN
  GITHUB_TOKEN
  LINEAR_API_KEY
  ICAL_FEED_URL
)

for KEY in "${KEYS[@]}"; do
  VALUE=$(grep -E "^${KEY}=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '\r' || true)
  if [ -z "$VALUE" ]; then
    echo "⚠️  Skipping $KEY (not found in $ENV_FILE)"
    continue
  fi

  echo "  → Putting $PREFIX/$KEY"
  aws ssm put-parameter \
    --region "$REGION" \
    --name "$PREFIX/$KEY" \
    --value "$VALUE" \
    --type SecureString \
    --overwrite \
    --no-cli-pager > /dev/null

  echo "    ✅ Done"
done

echo ""
echo "✅ All parameters seeded. Verify with:"
echo "   aws ssm get-parameters-by-path --region $REGION --path $PREFIX --with-decryption --query 'Parameters[*].Name'"
