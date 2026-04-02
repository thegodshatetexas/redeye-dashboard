module.exports = {
  apps: [{
    name: 'dashboard-redeye',
    script: 'node_modules/.bin/next',
    args: 'start -p 3010',
    cwd: '/var/www/dashboard.redeye.dev',
    env: {
      NODE_ENV: 'production',
      // All secrets are loaded from .env.production.local at deploy time via SSM.
      // See scripts/deploy-with-ssm.sh and docs/SSM.md.
    }
  }]
}
