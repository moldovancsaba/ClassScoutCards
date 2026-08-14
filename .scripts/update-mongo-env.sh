#!/bin/bash
set -e
cd /root/.openclaw/workspace/ClassScoutCards
vercel env rm MONGODB_URI production --yes 2>/dev/null || true
read -p "Enter actual MongoDB password for user apicard: " PASS
MONGODB_URI="REDACTED_ROTATE_ME_2026-08-14"
printf '%s\n' "$MONGODB_URI" | vercel env add MONGODB_URI production
echo "---"
vercel env ls production | grep MONGODB_URI
