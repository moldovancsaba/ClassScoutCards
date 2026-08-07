import { NextApiRequest, NextApiResponse } from "next";
import { checkCardBridgeAuth } from "@/lib/auth/requireCardBridgeKey";
import { isBridgeCollectionKey, BRIDGE_REGISTRY } from "@/lib/delivery/cardBridgeRegistry";
import { clampLimit, getOldestRows, parseSimpleFilter } from "@/lib/delivery/cardBridgeRows";

/**
 * Read-only, generalized across every registered collection: GET /api/card-bridge/rows
 *   ?collection=contentCards|providers|meetupGroups (default contentCards)
 *   &limit=1..25 (default 5)
 *   &id=<idField value>  — look up one record by its collection-specific id (contentCardId/id/leadId/…);
 *     shorthand for &filter={"<idField>":"<value>"} so callers never need to know each collection's
 *     idField name. Combining &id with &filter is rejected rather than silently picking one.
 *   &filter={"category":"Camps"}  — simple equality only, fields restricted to that collection's own
 *     read projection (see parseSimpleFilter) — never a generic Mongo query.
 *
 * (2026-08-07 finding) `&id=` used to be silently ignored here — this endpoint only ever read
 * `limit`/`filter`, so a request like `?collection=contentCards&id=cc-xxx` just returned the current
 * globally-oldest row(s), not the row matching that id. It never caused a wrong *write* (the POST
 * /update endpoint does a real per-id lookup), but it made "fetch this specific card" reads silently
 * return the wrong card whenever it wasn't coincidentally also the oldest unprocessed one. Fixed by
 * giving `id` real, first-class handling instead of requiring callers to know the right `filter` shape.
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
  const rawId = typeof req.query.id === "string" ? req.query.id : undefined;
  if (rawId !== undefined && rawFilter !== undefined) {
    return res.status(400).json({ error: "Pass either &id or &filter, not both" });
  }

  const filterResult = parseSimpleFilter(collectionParam, rawFilter);
  if (!filterResult.ok) {
    return res.status(400).json({ error: filterResult.error });
  }

  const idField = BRIDGE_REGISTRY[collectionParam].idField;
  const filter = rawId !== undefined ? { ...filterResult.filter, [idField]: rawId } : filterResult.filter;

  const limit = clampLimit(req.query.limit);

  try {
    const result = await getOldestRows(collectionParam, filter, limit);
    return res.status(200).json(result);
  } catch (error) {
    console.error("card-bridge/rows error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
