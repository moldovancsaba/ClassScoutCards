import { NextApiRequest, NextApiResponse } from "next";
import { checkCardBridgeAuth } from "@/lib/auth/requireCardBridgeKey";
import { applyCardBridgeSplit, validateSplitRequest } from "@/lib/delivery/cardBridgeSplit";

/**
 * Split path: POST /api/card-bridge/split
 * Body: { collection: "contentCards"|"providers", parentId, children: [...], reason, source, dryRun? }
 *
 * For a card that actually represents N real things (several real locations, an aggregator page
 * listing N real businesses, or two real orgs mashed into one record where each has since been
 * independently sourced) -- creates N new documents and marks the parent as blocked/quarantined
 * pointing at them, rather than trying to force N realities into one record's fields.
 *
 * SAFE BY DEFAULT, same convention as /update: dryRun defaults to true. Every child needs its own
 * genuinely distinguishing source (sourceUrl for contentCards, website for providers) -- no two
 * children may share one. contentCards children enter state="DISCOVERED" so the main app's own
 * pipeline re-processes them through its real gate; providers children are always created with
 * visibility="hidden" (forced, not caller-controlled) since a raw provider insert has no publish gate
 * at the database layer at all. See cardBridgeSplit.ts for the full reasoning and the real ID-generation
 * schemes this ports.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = checkCardBridgeAuth(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const validation = validateSplitRequest(req.body);
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error });
  }

  try {
    const outcome = await applyCardBridgeSplit(validation.value);
    if (!outcome.found) {
      return res.status(404).json({ error: `No ${outcome.collection} document with parentId "${outcome.parentId}"` });
    }
    return res.status(200).json(outcome);
  } catch (error) {
    console.error("card-bridge/split error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
