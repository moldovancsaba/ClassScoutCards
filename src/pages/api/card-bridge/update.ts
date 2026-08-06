import { NextApiRequest, NextApiResponse } from "next";
import { checkCardBridgeAuth } from "@/lib/auth/requireCardBridgeKey";
import { applyCardBridgeWrite, validateWriteRequest } from "@/lib/delivery/cardBridgeWrite";

/**
 * Write path: POST /api/card-bridge/update
 * Body: { collection, id, updates?, reason, source, dryRun?, touch? }  (dryRun defaults to true)
 *
 * SAFE BY DEFAULT: without an explicit `"dryRun": false` in the body, this NEVER writes — it returns
 * exactly what it would change (before/after) so the caller can review before applying. Every
 * non-dry-run write is also recorded in the `cardBridgeAuditLog` collection with the pre-image, so any
 * change made through this endpoint can be reviewed or manually reverted later. Every applied write
 * (touch or not) stamps lastReviewedAt/lastReviewedBy alongside updatedAt.
 *
 * `touch: true` allows `updates` to be omitted/empty — a pure "reviewed this card, decided no field
 * needs to change" write. This is required by the card-improvement loop's own rules: a card must be
 * marked reviewed (updatedAt advances, so the oldest-first queue rotates) even when step 4 of that
 * process (enrich/fix) concludes nothing needs fixing — see docs/card-improvement-process.md.
 *
 * See cardBridgeWrite.ts / cardBridgeRegistry.ts for exactly what can be written and why: per-collection
 * field allow-lists, a real Category enum check and a state-machine check (state can never be set to
 * "PUBLISHED" through this bridge), an https-URL sanity check on image fields, and the ported
 * copy-quality gate on description fields — this is deliberately not a generic field-setter.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = checkCardBridgeAuth(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const validation = validateWriteRequest(req.body);
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error });
  }

  try {
    const outcome = await applyCardBridgeWrite(validation.value);
    if (!outcome.found) {
      return res.status(404).json({ error: `No ${outcome.collection} document with that id` });
    }
    return res.status(200).json(outcome);
  } catch (error) {
    console.error("card-bridge/update error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
