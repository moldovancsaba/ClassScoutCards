import { NextApiRequest, NextApiResponse } from "next";
import { checkCardBridgeAuth } from "@/lib/auth/requireCardBridgeKey";
import { applyCardBridgeCreate, validateCreateRequest } from "@/lib/delivery/cardBridgeCreate";

/**
 * POST /api/card-bridge/create — insert ONE new `providers` listing for a real business the catalogue
 * does not have. See cardBridgeCreate.ts for what is required and why.
 *
 * Like every other write in this bridge it is dry-run by default: a create only happens with an
 * explicit `"dryRun": false`. The dry-run response returns the exact document that would be inserted,
 * including the derived `visibility`, so the caller can read it before committing.
 *
 *   { "provider": { name, category, borough, neighborhood, address, website, image,
 *                   activityTypes, shortDescription, longDescription, phone?, email?,
 *                   ageRanges?, recurringPrograms?, city? },
 *     "reason": "...", "source": "...", "dryRun": false }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = checkCardBridgeAuth(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const validation = validateCreateRequest(req.body);
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error });
  }

  try {
    const outcome = await applyCardBridgeCreate(validation.value);
    return res.status(outcome.blockedReason ? 409 : 200).json(outcome);
  } catch (error) {
    console.error("card-bridge/create error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
