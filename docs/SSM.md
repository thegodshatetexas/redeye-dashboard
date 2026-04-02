# SSM Parameter Store — redeye-dashboard

Secrets live in AWS SSM under the `/redeye/dashboard/` prefix as `SecureString` parameters. No secrets should be hardcoded in `ecosystem.config.js`, committed to git, or left in plaintext files on the server.

---

## How it works

1. `scripts/ssm-seed.sh` — run **once** locally to push secrets from `.env.local` into SSM
2. `scripts/deploy-with-ssm.sh` — every deploy fetches fresh secrets from SSM and writes `.env.production.local` on the server before building
3. `ecosystem.config.js` — clean, no secrets; Next.js reads `.env.production.local` at startup

---

## Initial Setup

### 1. Attach an IAM role to the EC2 instance

The EC2 instance needs permission to read SSM parameters. Attach a role with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParametersByPath",
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:us-west-2:*:parameter/redeye/dashboard/*"
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:us-west-2:*:key/*"
    }
  ]
}
```

### 2. Seed secrets into SSM (one-time)

```bash
cd /path/to/redeye-dashboard
chmod +x scripts/ssm-seed.sh
./scripts/ssm-seed.sh
```

### 3. Verify

```bash
aws ssm get-parameters-by-path \
  --region us-west-2 \
  --path /redeye/dashboard \
  --with-decryption \
  --query 'Parameters[*].Name'
```

---

## Adding a New Secret

```bash
# 1. Add to SSM
aws ssm put-parameter \
  --region us-west-2 \
  --name "/redeye/dashboard/MY_NEW_SECRET" \
  --value "the-value" \
  --type SecureString \
  --overwrite

# 2. Add to .env.local (for local dev)
echo "MY_NEW_SECRET=the-value" >> .env.local

# 3. Deploy — the secret is automatically picked up
./scripts/deploy-with-ssm.sh
```

No code changes needed unless you're adding a new env var reference in the app itself.

---

## Rotating a Secret

```bash
# Update the value in SSM
aws ssm put-parameter \
  --region us-west-2 \
  --name "/redeye/dashboard/GOOGLE_CLIENT_SECRET" \
  --value "new-secret-value" \
  --type SecureString \
  --overwrite

# Redeploy to pick it up
./scripts/deploy-with-ssm.sh
```

The old value is automatically overwritten. SSM keeps version history — you can roll back with `--version` if needed.

---

## IAM Policy Summary

| Action | Resource | Why |
|--------|----------|-----|
| `ssm:GetParametersByPath` | `/redeye/dashboard/*` | Fetch all secrets at deploy time |
| `ssm:GetParameter` | `/redeye/dashboard/*` | Fetch individual secrets |
| `kms:Decrypt` | `*` (or specific key) | Decrypt SecureString values |

Attach to the EC2 instance role — no access keys needed on the server.

---

## Current Parameters

| SSM Name | Description |
|----------|-------------|
| `/redeye/dashboard/GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `/redeye/dashboard/GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `/redeye/dashboard/AUTH_SECRET` | next-auth signing secret |
| `/redeye/dashboard/AUTH_URL` | App URL for next-auth |
| `/redeye/dashboard/AUTH_TRUST_HOST` | Trust reverse proxy headers |
| `/redeye/dashboard/NEXTAUTH_SECRET` | Legacy next-auth secret (same as AUTH_SECRET) |
| `/redeye/dashboard/NEXTAUTH_URL` | Legacy next-auth URL (same as AUTH_URL) |
| `/redeye/dashboard/SESSION_COOKIE_DOMAIN` | Shared cookie domain (.redeye.dev) |
| `/redeye/dashboard/GITHUB_TOKEN` | GitHub API token for PR data |
| `/redeye/dashboard/LINEAR_API_KEY` | Linear API key for in-progress issues |
| `/redeye/dashboard/ICAL_FEED_URL` | iCal feed URL for concerts widget |
