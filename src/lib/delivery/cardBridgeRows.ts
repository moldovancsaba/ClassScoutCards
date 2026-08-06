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
  collection: BridgeCollectionKey;
  filter: Record<string, string | number | boolean>;
  rows: Array<Record<string, unknown>>;
}

export async function getOldestRows(
  collection: BridgeCollectionKey,
  filter: Record<string, string | number | boolean>,
  limit: number,
): Promise<OldestRowsResult> {
  const config = BRIDGE_REGISTRY[collection];
  const db = getBridgeDb();
  const rows = await db
    .collection(config.mongoCollection)
    .find(filter, { projection: config.readProjection })
    .sort({ updatedAt: 1, [config.idField]: 1 })
    .limit(limit)
    .toArray();

  return { count: rows.length, limit, collection, filter, rows };
}
