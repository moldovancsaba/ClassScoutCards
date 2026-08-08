import { getBridgeDb } from "@/lib/delivery/cardBridgeClient";
import { BRIDGE_REGISTRY, type BridgeCollectionKey } from "@/lib/delivery/cardBridgeRegistry";

export const MAX_LIMIT = 25;
export const DEFAULT_LIMIT = 5;

export function clampLimit(rawLimit: unknown): number {
  const n = Number(rawLimit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

export type SimpleFilterResult =
  | { ok: true; filter: Record<string, string | number | boolean> }
  | { ok: false; error: string };

/**
 * Parses a caller-supplied JSON filter string into a SIMPLE equality-only filter, restricted to
 * fields the collection already exposes via its own read projection (never `_id`, never a key the
 * bridge doesn't otherwise let you see). Rejects anything containing a Mongo operator (`$...`), a
 * non-primitive value, or a field not in that collection's projection — this is deliberately NOT a
 * generic Mongo query passthrough.
 */
export function parseSimpleFilter(collection: BridgeCollectionKey, rawFilter: string | undefined): SimpleFilterResult {
  if (!rawFilter) return { ok: true, filter: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawFilter);
  } catch {
    return { ok: false, error: "filter must be valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "filter must be a JSON object" };
  }

  const allowedFields = new Set(Object.keys(BRIDGE_REGISTRY[collection].readProjection).filter((k) => k !== "_id"));
  const filter: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (key.startsWith("$") || !allowedFields.has(key)) {
      return { ok: false, error: `filter field "${key}" is not allowed. Allowed: ${[...allowedFields].join(", ")}` };
    }
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return { ok: false, error: `filter value for "${key}" must be a string, number, or boolean (equality only)` };
    }
    filter[key] = value;
  }
  return { ok: true, filter };
}

export interface OldestRowsResult {
  count: number;
  limit: number;
  offset: number;
  collection: BridgeCollectionKey;
  filter: Record<string, string | number | boolean>;
  rows: Array<Record<string, unknown>>;
}

/**
 * Clamps a caller-supplied `offset`. Unlike `limit` there is no upper bound — a sweep of the ~900
 * published content cards has to be able to reach the far end of the pool.
 */
export function clampOffset(rawOffset: unknown): number {
  const n = Number(rawOffset);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

/**
 * (2026-08-08) `offset` exists so a full-pool SWEEP can read without writing.
 *
 * Before it, the only way to see past the oldest `limit` rows was to touch them, which moves them to
 * the back of the `updatedAt` ordering. That works — a touch is a genuine "reviewed, no change needed"
 * record — but it makes read-only reconnaissance impossible: you could not survey the pool to decide
 * where to look without first mutating ~900 records. The targeted off-topic sweep of published cards
 * (a standing open item) is exactly that shape of job.
 *
 * The sort is `updatedAt` then the id field, which is a total order, so paging by offset is stable as
 * long as nothing is written between pages. That caveat is real: interleaving writes with paging will
 * shift rows backwards past the cursor and can skip records. Sweep first, then write — or re-sweep
 * from 0 afterwards to confirm coverage.
 */
export async function getOldestRows(
  collection: BridgeCollectionKey,
  filter: Record<string, string | number | boolean>,
  limit: number,
  offset = 0,
): Promise<OldestRowsResult> {
  const config = BRIDGE_REGISTRY[collection];
  const db = getBridgeDb();
  const rows = await db
    .collection(config.mongoCollection)
    .find(filter, { projection: config.readProjection })
    .sort({ updatedAt: 1, [config.idField]: 1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return { count: rows.length, limit, offset, collection, filter, rows };
}
