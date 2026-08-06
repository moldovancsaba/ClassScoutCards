import { MongoClient } from "mongodb";
import { env } from "@/lib/env";

/**
 * Shared cached client for the generalized card-bridge read/write routes (cardBridgeRows.ts,
 * cardBridgeWrite.ts). Deliberately separate from contentCardsBridge.ts's own client — that module
 * backs the already-verified-in-production /api/card-bridge/oldest-cards route and is left untouched
 * to avoid any risk of regressing it.
 */
let cachedClient: MongoClient | null = null;

export function getBridgeClient(): MongoClient {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI not configured");
  }
  if (!cachedClient) {
    cachedClient = new MongoClient(env.MONGODB_URI, { appName: "CARDBRIDGE-RW", maxPoolSize: 5 });
  }
  return cachedClient;
}

export function getBridgeDb() {
  return getBridgeClient().db(env.MONGODB_DB_NAME);
}
