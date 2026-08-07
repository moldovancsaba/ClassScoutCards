import { NextApiRequest, NextApiResponse } from "next";
import { checkCardBridgeAuth } from "@/lib/auth/requireCardBridgeKey";
import { getAllCollectionStats } from "@/lib/delivery/cardBridgeStats";

/**
 * Read-only aggregate counts: GET /api/card-bridge/stats
 *
 * Returns, per collection (`contentCards`, `providers`): total document count, and a count breakdown
 * by borough, by neighborhood, and by activity. No individual record content is returned -- this is
 * strictly aggregate counts, which is also why /pages/stats.tsx (the human-facing view of the same
 * data) doesn't require the bridge key the way every other /api/card-bridge/* route does.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = checkCardBridgeAuth(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const stats = await getAllCollectionStats();
    return res.status(200).json({ stats });
  } catch (error) {
    console.error("card-bridge/stats error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
