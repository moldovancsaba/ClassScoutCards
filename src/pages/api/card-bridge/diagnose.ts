import { NextApiRequest, NextApiResponse } from "next";
import { MongoClient } from "mongodb";
import { checkCardBridgeAuth } from "@/lib/auth/requireCardBridgeKey";
import { env } from "@/lib/env";

/**
 * Diagnostic (read-only): lists every database + collection on the SAME Atlas cluster MONGODB_URI
 * points at, with a document-count sample for anything that looks like a classscout collection —
 * so a misconfigured MONGODB_DB_NAME can be identified with evidence instead of guesswork. Ignores
 * MONGODB_DB_NAME entirely (deliberately) since the point is to find the right value for it.
 *
 * Bearer-gated same as the other card-bridge routes. Temporary/diagnostic — safe to remove once the
 * correct MONGODB_DB_NAME is confirmed and set.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = checkCardBridgeAuth(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (!env.MONGODB_URI) {
    return res.status(503).json({ error: "MONGODB_URI not configured" });
  }

  const client = new MongoClient(env.MONGODB_URI, { appName: "CARDBRIDGE-DIAGNOSE" });
  try {
    await client.connect();
    const admin = client.db().admin();
    const { databases } = await admin.listDatabases();

    const report: Array<{
      name: string;
      sizeOnDiskMB: number;
      collections: Array<{ name: string; estimatedCount: number }>;
    }> = [];

    for (const d of databases) {
      if (["admin", "local", "config"].includes(d.name)) continue;
      const db = client.db(d.name);
      const collections = await db.listCollections().toArray();
      const relevant = collections.filter((c) => /content|provider|meetup|card/i.test(c.name));
      const targets = relevant.length ? relevant : collections;
      const withCounts = await Promise.all(
        targets.slice(0, 15).map(async (c) => ({
          name: c.name,
          estimatedCount: await db.collection(c.name).estimatedDocumentCount(),
        })),
      );
      report.push({ name: d.name, sizeOnDiskMB: Math.round(((d.sizeOnDisk ?? 0) / 1e6) * 10) / 10, collections: withCounts });
    }

    return res.status(200).json({ configuredDbName: env.MONGODB_DB_NAME, databases: report });
  } catch (error) {
    console.error("card-bridge/diagnose error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    await client.close();
  }
}
