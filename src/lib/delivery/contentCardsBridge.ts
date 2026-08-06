import { MongoClient } from "mongodb";
import { env } from "@/lib/env";

/**
 * Read-only bridge into the main classscout app's content-card pool (collection
 * `classscoutContentCards`, the `ClassScoutContentCard` type in that repo's
 * src/lib/contentIntelligence/contentCards.ts — mirrored here as a minimal local shape since this is a
 * separate repo/deployment; keep the two in sync by hand if the source type changes).
 *
 * Deliberately NOT a generic query passthrough — see ALLOWED_STATES / MAX_LIMIT and the fixed
 * projection in getOldestContentCards. Read-only: this module has no update/insert/delete function.
 */

/** Mirrors classscout's ContentCardState union (src/lib/contentIntelligence/contentCards.ts). */
export const ALLOWED_STATES = [
  "DISCOVERED",
  "EXTRACTING",
  "EXTRACTED",
  "PREPARING",
  "BLOCKED_REPAIRABLE",
  "BLOCKED_TERMINAL",
  "PARKED_COOLDOWN",
  "REVIEW_READY",
  "PUBLISHED",
  "QUARANTINED",
] as const;
export type ContentCardState = (typeof ALLOWED_STATES)[number];

export const MAX_LIMIT = 25;
export const DEFAULT_LIMIT = 5;

/** Fixed, non-sensitive projection of a content card — never the full document. */
export interface ContentCardSummary {
  contentCardId: string;
  kind?: string;
  state: ContentCardState;
  title: string;
  sourcePool?: string;
  sourceHost?: string;
  categoryHint?: string;
  boroughGuess?: string;
  neighborhoodGuess?: string;
  enrichmentStatus?: string;
  sourceAvailability?: string;
  incompleteFields?: unknown[];
  blockerCodes?: string[];
  updatedAt: string;
  createdAt?: string;
}

const PROJECTION = {
  _id: 0,
  contentCardId: 1,
  kind: 1,
  state: 1,
  title: 1,
  sourcePool: 1,
  sourceHost: 1,
  categoryHint: 1,
  boroughGuess: 1,
  neighborhoodGuess: 1,
  enrichmentStatus: 1,
  sourceAvailability: 1,
  incompleteFields: 1,
  blockerCodes: 1,
  updatedAt: 1,
  createdAt: 1,
} as const;

/** Clamps a caller-supplied limit into (0, MAX_LIMIT]; non-finite/absent falls back to DEFAULT_LIMIT. */
export function clampLimit(rawLimit: unknown): number {
  const n = Number(rawLimit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

/** True iff `value` is one of classscout's real content-card states. */
export function isAllowedState(value: unknown): value is ContentCardState {
  return typeof value === "string" && (ALLOWED_STATES as readonly string[]).includes(value);
}

let cachedClient: MongoClient | null = null;

function getClient(): MongoClient {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI not configured");
  }
  if (!cachedClient) {
    cachedClient = new MongoClient(env.MONGODB_URI, {
      appName: "CARDBRIDGE",
      maxPoolSize: 5,
    });
  }
  return cachedClient;
}

/**
 * The oldest-updated content cards (optionally filtered by state), sorted `updatedAt asc,
 * contentCardId asc` — the same canonical oldest-first ordering every maintainer lane in the main app
 * uses. `state` MUST already be validated via `isAllowedState`; `limit` MUST already be clamped via
 * `clampLimit` — this function trusts its caller and does no further validation, by design (the HTTP
 * layer is where untrusted input gets checked, once).
 */
export async function getOldestContentCards(
  state: ContentCardState | undefined,
  limit: number,
): Promise<ContentCardSummary[]> {
  const client = getClient();
  await client.connect();
  const db = client.db(env.MONGODB_DB_NAME);
  const collection = db.collection<ContentCardSummary>(env.MONGODB_CONTENT_CARDS_COLLECTION);

  const filter = state ? { state } : {};
  return collection
    .find(filter, { projection: PROJECTION })
    .sort({ updatedAt: 1, contentCardId: 1 })
    .limit(limit)
    .toArray();
}
