import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

/**
 * Card-bridge auth guard: requires a configured CARD_BRIDGE_API_KEY and a matching
 * `Authorization: Bearer <key>` header, compared in constant time.
 *
 * Dedicated secret, separate from CLASSSCOUT_INGEST_KEY — this key only ever authorizes READS from
 * the main classscout app's content-card pool (via /api/card-bridge/*), a different and much smaller
 * blast radius than the ingest key, so it can be issued/rotated/revoked independently.
 *
 * Pure function of a header value — no request/response types — so it is trivial to unit test and
 * reuse from any route handler shape.
 */
export type CardBridgeAuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

function extractBearer(authorizationHeader: string | undefined | null): string | null {
  if (!authorizationHeader?.toLowerCase().startsWith("bearer ")) return null;
  const token = authorizationHeader.slice(7).trim();
  return token || null;
}

export function checkCardBridgeAuth(authorizationHeader: string | undefined | null): CardBridgeAuthResult {
  const configured = env.CARD_BRIDGE_API_KEY.trim();
  if (!configured) {
    return { ok: false, status: 503, error: "Card bridge is not configured (set CARD_BRIDGE_API_KEY)" };
  }
  const provided = extractBearer(authorizationHeader);
  if (!provided) {
    return { ok: false, status: 401, error: "Missing credentials: Authorization Bearer <key>" };
  }
  const a = Buffer.from(configured, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
