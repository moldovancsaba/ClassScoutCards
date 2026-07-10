const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const envLocalPath = path.join(projectDir, '.env.local');
const tokenMatch = fs.readFileSync(envLocalPath, 'utf8').match(/VERCEL_OIDC_TOKEN="([^"]+)"/);
if (!tokenMatch) {
  console.error('No OIDC token found in .env.local');
  process.exit(1);
}
const token = tokenMatch[1];

const password = process.argv[2];
const uri = `mongodb+srv://apicard:${encodeURIComponent(password)}@cardsapi.xeksqkr.mongodb.net/?appName=CARDSAPI`;

try {
  execSync('vercel env rm MONGODB_URI production --token ' + token + ' --yes 2>/dev/null || true', { cwd: projectDir, stdio: 'inherit' });
} catch (e) {
  // ignore
}

const child = execSync(`printf '%s\\n' '${uri.replace(/'/g, "'\\''")}' | vercel env add MONGODB_URI production --token ${token}`, { cwd: projectDir, encoding: 'utf8' });
console.log(child);
