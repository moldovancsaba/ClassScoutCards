import { NextApiRequest, NextApiResponse } from "next";

// Placeholder - will be updated after checking existing patterns
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Card ID is required" });
  }

  try {
    const { env } = await import("@/lib/env");
    const { MongoClient } = await import("mongodb");
    
    if (!env.MONGODB_URI) {
      return res.status(503).json({ error: "Database not configured" });
    }

    const client = new MongoClient(env.MONGODB_URI, {
      appName: "CARDSAPI",
      maxPoolSize: 5,
    });
    await client.connect();
    const db = client.db(env.MONGODB_DB_NAME);
    const collection = db.collection(env.MONGODB_CARDS_COLLECTION);

    const card = await collection.findOne({ id });

    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    return res.status(200).json(card);
  } catch (error) {
    console.error("Card fetch error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
