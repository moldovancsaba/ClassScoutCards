const { execSync } = require('child_process');
const fs = require('fs');

// Read OIDC token from .env.local
const envLocal = fs.readFileSync('/root/.openclaw/workspace/ClassScoutCards/.env.local', 'utf8');
const tokenMatch = envLocal.match(/VERCEL_OIDC_TOKEN="([^"]+)"/);
if (!tokenMatch) {
  console.error('No VERCEL_OIDC_TOKEN found');
  process.exit(1);
}
const token = tokenMatch[1];

// The actual password
const password = 'apicard11-11';
const uri = `REDACTED_ROTATE_ME_2026-08-14`;

console.log('Updating MONGODB_URI with actual password...');
execSync(`echo '${uri}' | vercel env add MONGODB_URI production --token ${token}`, { cwd: '/root/.openclaw/workspace/ClassScoutCards', encoding: 'utf8' });
console.log('Deploying...');
execSync('vercel --prod --yes --token ' + token, { cwd: '/root/.openclaw/workspace/ClassScoutCards', encoding: 'utf8' });
