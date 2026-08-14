#!/usr/bin/env node
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectDir = path.resolve(__dirname, "..");
const envLocalPath = path.join(projectDir, ".env.local");
const tokenMatch = fs.readFileSync(envLocalPath, "utf8").match(/VERCEL_OIDC_TOKEN="([^"]+)"/);
if (!tokenMatch) {
  console.error("No OIDC token found in .env.local");
  process.exit(1);
}
const token = tokenMatch[1];
const password = process.argv[2] || "apicard11-11";
const uri = `REDACTED_ROTATE_ME_2026-08-14`;

console.log("Updating Vercel env var with token prefix:", token.slice(0, 6) + "...");
try {
  execSync(`vercel env rm MONGODB_URI production --token ${token} --yes 2>/dev/null || true`, { cwd: projectDir, stdio: "inherit" });
} catch (e) {
  console.error("Remove env warning:", e.message);
}

try {
  const out = execSync("vercel --token *** --yes --cwd .", { cwd: projectDir, encoding: "utf8" });
  console.log(out);
} catch (e) {
  console.error("Deploy failed:", e.message);
  process.exit(1);
}
