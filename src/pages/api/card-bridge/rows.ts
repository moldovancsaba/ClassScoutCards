import { NextApiRequest, NextApiResponse } from "next";
import { checkCardBridgeAuth } from "@/lib/auth/requireCardBridgeKey";
import { isBridgeCollectionKey, BRIDGE_REGISTRY } from "@/lib/delivery/cardBridgeRegistry";
import { clampLimit, getOldestRows, parseSimpleFilter } from "@/lib/delivery/cardBridgeRows";

/**
 * Read-only, generalized across every registered collection: GET /api/card-bridge/rows
 *   ?collection=contentCards|providers|meetupGroups (default contentCards)
 *   &limit=1..25 (default 5)
 *   &filter={"category":"Camps"}  — simple equality only, fields restricted to that collection's own
 *     read projection (see parseSimpleFilter) — never a generic Mongo query.
 *
 * Existing /api/card-bridge/oldest-cards is untouched (already verified in production); this is the
 * generalized sibling that also covers providers/meetupGroups, added when write support was added.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = checkCardBridgeAuth(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const collectionParam = typeof req.query.collection === "string" ? req.query.collection : "contentCards";
  if (!isBridgeCollectionKey(collectionParam)) {
    return res.status(400).json({ error: `Unsupported collection "${collectionParam}". Allowed: ${Object.keys(BRIDGE_REGISTRY).join(", ")}` });
  }

  const rawFilter = typeof req.query.filter === "string" ? req.query.filter : undefined;
  const filterResult = parseSimpleFilter(collectionParam, rawFilter);
  if (!filterResult.ok) {
    return res.status(400).json({ error: filterResult.error });
  }

  const limit = clampLimit(req.query.limit);

  try {
    const result = await getOldestRows(collectionParam, filterResult.filter, limit);
    return res.status(200).json(result);
  } catch (error) {
    console.error("card-bridge/rows error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
