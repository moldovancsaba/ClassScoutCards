#!/bin/bash
set -e
cd /root/.openclaw/workspace/ClassScoutCards
# Get token from .env.local
TOKEN=$(grep VERCEL_OIDC_TOKEN .env.local | cut -d'"' -f2)
vercel env rm MONGODB_URI production --yes --token "$TOKEN" 2>/dev/null || true
printf '%s\n' 'mongodb+srv://apicard:***@cardsapi.xeksqkr.mongodb.net/?appName=CARDSAPI' | vercel env add MONGODB_URI production --token "$TOKEN"
echo '---'
vercel env ls production --token "$TOKEN" | grep MONGODB_URI || true
rm -f /root/.openclaw/workspace/ClassScoutCards/.scripts/_mongo_update_tmp.sh