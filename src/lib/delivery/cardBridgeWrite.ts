import { randomUUID } from "crypto";
import { getBridgeDb } from "@/lib/delivery/cardBridgeClient";
import {
  BRIDGE_REGISTRY,
  CATEGORY_VALUES,
  isBridgeCollectionKey,
  rejectedFields,
  type BridgeCollectionKey,
} from "@/lib/delivery/cardBridgeRegistry";
import { validateCopyQuality } from "@/lib/validation/copyQuality";

export interface NormalizedWriteRequest {
  collection: BridgeCollectionKey;
  id: string;
  updates: Record<string, unknown>;
  reason: string;
  source: string;
  dryRun: boolean;
}

export type WriteValidationResult =
  | { ok: true; value: NormalizedWriteRequest }
  | { ok: false; status: 400; error: string };

const MIN_REASON_LENGTH = 5;

/**
 * Pure validation of an incoming write request body — no I/O. Every rejection path here is a 400: bad
 * shape, an unregistered collection, a field outside that collection's writable allow-list, a category
 * outside the real enum, an image field that isn't a plausible https URL, or copy that fails the
 * ported public-description quality gate. Nothing here ever contacts the database.
 */
export function validateWriteRequest(body: unknown): WriteValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!isBridgeCollectionKey(b.collection)) {
    return {
      ok: false,
      status: 400,
      error: `Unsupported collection "${String(b.collection)}". Allowed: ${Object.keys(BRIDGE_REGISTRY).join(", ")}`,
    };
  }
  const collection = b.collection;

  if (typeof b.id !== "string" || !b.id.trim()) {
    return { ok: false, status: 400, error: "id must be a non-empty string" };
  }

  if (typeof b.updates !== "object" || b.updates === null || Array.isArray(b.updates)) {
    return { ok: false, status: 400, error: "updates must be a JSON object" };
  }
  const updates = b.updates as Record<string, unknown>;
  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, error: "updates must contain at least one field" };
  }

  const rejected = rejectedFields(collection, updates);
  if (rejected.length) {
    return {
      ok: false,
      status: 400,
      error: `Field(s) not writable for "${collection}": ${rejected.join(", ")}. Allowed: ${BRIDGE_REGISTRY[collection].writableFields.join(", ")}`,
    };
  }

  if (typeof b.reason !== "string" || b.reason.trim().length < MIN_REASON_LENGTH) {
    return { ok: false, status: 400, error: `reason must be a string of at least ${MIN_REASON_LENGTH} characters` };
  }
  if (typeof b.source !== "string" || !b.source.trim()) {
    return { ok: false, status: 400, error: "source must be a non-empty string (who/what is making this change)" };
  }

  if (collection === "providers" && "category" in updates) {
    if (!(CATEGORY_VALUES as readonly string[]).includes(updates.category as string)) {
      return { ok: false, status: 400, error: `category must be one of: ${CATEGORY_VALUES.join(", ")}` };
    }
  }

  for (const field of BRIDGE_REGISTRY[collection].copyFields) {
    const value = updates[field];
    if (typeof value === "string") {
      const copyError = validateCopyQuality(value, field);
      if (copyError) return { ok: false, status: 400, error: copyError };
    }
  }

  for (const field of ["image", "coverImageUrl"]) {
    const value = updates[field];
    if (typeof value === "string" && (!value.startsWith("https://") || value.trim().length < 12)) {
      return { ok: false, status: 400, error: `${field} must be a real https:// URL` };
    }
  }

  // dryRun defaults to true — a write only actually applies when the caller explicitly passes false.
  const dryRun = b.dryRun !== false;

  return { ok: true, value: { collection, id: b.id, updates, reason: b.reason, source: b.source, dryRun } };
}

export interface WriteOutcome {
  found: boolean;
  dryRun: boolean;
  collection: BridgeCollectionKey;
  id: string;
  before?: Record<string, unknown>;
  applied?: Record<string, unknown>;
  auditId?: string;
}

/** Applies (or dry-runs) an already-validated write. Assumes `validateWriteRequest` already passed. */
export async function applyCardBridgeWrite(request: NormalizedWriteRequest): Promise<WriteOutcome> {
  const config = BRIDGE_REGISTRY[request.collection];
  const db = getBridgeDb();
  const collection = db.collection(config.mongoCollection);

  const current = await collection.findOne({ [config.idField]: request.id });
  if (!current) {
    return { found: false, dryRun: request.dryRun, collection: request.collection, id: request.id };
  }

  const before: Record<string, unknown> = {};
  for (const key of Object.keys(request.updates)) before[key] = current[key] ?? null;

  if (request.dryRun) {
    return { found: true, dryRun: true, collection: request.collection, id: request.id, before, applied: request.updates };
  }

  const nowIso = new Date().toISOString();
  const finalUpdates: Record<string, unknown> = { ...request.updates, updatedAt: nowIso };

  // Mirror the main app's categoryReclassifiedFrom/At provenance convention (business-rules.md rule
  // re: board 44 F3) so a category change made through this bridge is reversible the same way.
  if (request.collection === "providers" && "category" in request.updates && current.category !== request.updates.category) {
    finalUpdates.categoryReclassifiedFrom = current.category;
    finalUpdates.categoryReclassifiedAt = nowIso;
  }

  const auditId = randomUUID();
  await db.collection("cardBridgeAuditLog").insertOne({
    auditId,
    collection: request.collection,
    id: request.id,
    before,
    after: finalUpdates,
    reason: request.reason,
    source: request.source,
    appliedAt: nowIso,
  });

  await collection.updateOne({ [config.idField]: request.id }, { $set: finalUpdates });

  return { found: true, dryRun: false, collection: request.collection, id: request.id, before, applied: finalUpdates, auditId };
}
