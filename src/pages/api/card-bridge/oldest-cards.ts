import { NextApiRequest, NextApiResponse } from "next";
import { checkCardBridgeAuth } from "@/lib/auth/requireCardBridgeKey";
import {
  clampLimit,
  getOldestContentCards,
  isAllowedState,
  ALLOWED_STATES,
  type ContentCardState,
} from "@/lib/delivery/contentCardsBridge";

/**
 * Read-only bridge: GET /api/card-bridge/oldest-cards?state=PUBLISHED&limit=5
 *
 * Returns the oldest-updated content cards from the main classscout app's shared MongoDB (this app
 * deploys separately from that app specifically so this experiment can't affect it), for callers whose
 * network policy can reach this app's HTTPS endpoint but cannot open a native MongoDB connection
 * directly. Bearer-key gated (Authorization: Bearer <CARD_BRIDGE_API_KEY>).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = checkCardBridgeAuth(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const stateParam = typeof req.query.state === "string" ? req.query.state : undefined;
  if (stateParam && !isAllowedState(stateParam)) {
    return res.status(400).json({ error: `Unsupported state "${stateParam}". Allowed: ${ALLOWED_STATES.join(", ")}` });
  }
  const state: ContentCardState | undefined = stateParam && isAllowedState(stateParam) ? stateParam : undefined;

  const limit = clampLimit(req.query.limit);

  try {
    const cards = await getOldestContentCards(state, limit);
    return res.status(200).json({ count: cards.length, limit, state: state ?? "all", cards });
  } catch (error) {
    console.error("card-bridge/oldest-cards error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
