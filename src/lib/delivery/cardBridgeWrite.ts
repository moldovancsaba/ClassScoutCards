import { randomUUID } from "crypto";
import { getBridgeDb } from "@/lib/delivery/cardBridgeClient";
import {
  BRIDGE_REGISTRY,
  BRIDGE_SETTABLE_STATES,
  CATEGORY_VALUES,
  isBridgeCollectionKey,
  rejectedFields,
  type BridgeCollectionKey,
} from "@/lib/delivery/cardBridgeRegistry";
import { validateCopyQuality } from "@/lib/validation/copyQuality";
import { alignActivityTypes, NO_CATEGORY_PLACEHOLDER } from "@/lib/delivery/activityAlignment";
import { computeContentCardIdentity } from "@/lib/delivery/cardBridgeSplit";
import { buildFamilyServicePlaceFact, buildFamilyServiceReviewPacket, isPublicStatus, normalizeFamilyServiceLead, reviewPacketEligible } from "@/lib/familyServices/core";
import { FAMILY_SERVICE_LEAD_STATUSES, type FamilyServiceLead } from "@/lib/familyServices/types";

export interface NormalizedWriteRequest {
  collection: BridgeCollectionKey;
  id: string;
  /** May be empty ONLY when touch=true — a pure "reviewed, nothing to change" write. */
  updates: Record<string, unknown>;
  reason: string;
  source: string;
  dryRun: boolean;
  /** When true, this write is allowed to carry zero content fields: it still stamps updatedAt +
   *  lastReviewedAt/lastReviewedBy on apply, recording that the card WAS reviewed even though no field
   *  needed to change. This is how "pull oldest -> research -> decide no action needed -> still record
   *  the review and rotate the queue" is expressed — never skip step 6/7 just because step 4 found
   *  nothing to fix. */
  touch: boolean;
}

export type WriteValidationResult =
  | { ok: true; value: NormalizedWriteRequest }
  | { ok: false; status: 400; error: string };

const MIN_REASON_LENGTH = 5;

/** The exact fields `computeContentCardIdentity` hashes into a content card's `fingerprint`. Every one
 *  of them is writable through this bridge, so a change to any of them makes the stored fingerprint
 *  stale — see the recompute in `applyCardBridgeWrite` for why that matters. */
const FINGERPRINT_BASIS_FIELDS = ["title", "sourceUrl", "categoryHint", "boroughGuess", "neighborhoodGuess"] as const;

/**
 * Parses a candidate `contentCards.sourceUrl` and returns its canonical host, or null if the value is
 * not a usable source. Shared by validation (reject early) and the apply path (derive `sourceHost`), so
 * the two can never disagree about what counts as valid.
 *
 * The host is lowercased and `www.`-stripped to match how `sourceHost` is already stored on real
 * records -- live data has `sourceHost: "streb.org"` next to `sourceUrl: "https://www.streb.org/"`, so
 * keeping the `www.` here would silently split one duplicate cluster into two under the per-domain
 * sweep.
 */
export function parseSourceUrl(value: string): { host: string } | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  // A hostname with no dot ("localhost", "internal") is never a real public source page.
  if (!host.includes(".")) return null;
  return { host };
}

/**
 * Pure validation of an incoming write request body — no I/O. Every rejection path here is a 400: bad
 * shape, an unregistered collection, a field outside that collection's writable allow-list, a category
 * outside the real enum, an image field that isn't a plausible https URL, a sourceUrl that isn't a
 * parseable https URL, or copy that fails the ported public-description quality gate. Nothing here ever
 * contacts the database.
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

  const touch = b.touch === true;

  if (b.updates !== undefined && (typeof b.updates !== "object" || b.updates === null || Array.isArray(b.updates))) {
    return { ok: false, status: 400, error: "updates must be a JSON object" };
  }
  const updates = (b.updates as Record<string, unknown> | undefined) ?? {};
  if (Object.keys(updates).length === 0 && !touch) {
    return { ok: false, status: 400, error: "updates must contain at least one field, unless touch=true (a pure reviewed-no-change write)" };
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

  // (2026-08-07, owner directive: "Never add 'no category' even if no category") The ingestion-only
  // placeholder must never enter ANY category/activity field through this bridge, on any collection.
  // `alignActivityTypes` already strips it from `providers.activityTypes`, but that only covers one
  // field on one collection -- this is the absolute boundary rule, so no future writable field can
  // quietly reintroduce it. When there genuinely is no category, the correct value is ABSENT (omit the
  // field), never a placeholder string standing in for one: a literal "NO CATEGORY" chip rendered on a
  // real family's card is worse than no chip at all. See NO_CATEGORY_PLACEHOLDER in activityAlignment.ts
  // for how this reached live records and why the strip is load-bearing.
  const placeholderFields = ["category", "categoryHint", "primaryActivityType", "activityTypes"] as const;
  for (const field of placeholderFields) {
    if (!(field in updates)) continue;
    const value = updates[field];
    const values = Array.isArray(value) ? value : [value];
    if (values.some((entry) => typeof entry === "string" && entry.trim().toLowerCase() === NO_CATEGORY_PLACEHOLDER)) {
      return {
        ok: false,
        status: 400,
        error: `${field} must never contain the ingestion placeholder "${NO_CATEGORY_PLACEHOLDER}" (owner directive: never add "no category" even when there is no category). Omit the field instead — an absent value is correct; a placeholder string renders as a literal "NO CATEGORY" chip on a real family's card.`,
      };
    }
  }

  if ((collection === "providers" || collection === "meetupGroups") && "qualityStatus" in updates && updates.qualityStatus !== "quarantined") {
    return { ok: false, status: 400, error: 'qualityStatus can only be set to "quarantined" (the only real value the main app defines) — omit the field entirely rather than trying to clear it through this bridge' };
  }
  if ((collection === "providers" || collection === "meetupGroups") && "visibility" in updates && updates.visibility !== "hidden") {
    return { ok: false, status: 400, error: 'visibility can only be set to "hidden" (the only real value the main app defines) — omit the field entirely rather than trying to clear it through this bridge' };
  }

  // (2026-08-07, owner directive) Cards must show at most 3 headline activities, never a raw keyword
  // dump. The actual top-3 SELECTION (which 3, in what order) is real business logic that needs the
  // provider's own name/primaryActivityType to reason about — see `alignActivityTypes` in
  // `activityAlignment.ts`, applied in `applyCardBridgeWrite` below, where that context is available.
  // This is only a sanity ceiling here (pure validation, no DB access yet) to reject obviously-garbage
  // input before it reaches that step, not the real cap.
  if (collection === "providers" && Array.isArray(updates.activityTypes) && (updates.activityTypes as unknown[]).length > 20) {
    return {
      ok: false,
      status: 400,
      error: `activityTypes has ${(updates.activityTypes as unknown[]).length} entries — that looks like a raw keyword dump, not a curated list. Trim to the source's own genuinely-evidenced activities before writing; this bridge realigns to the real top 3 automatically, but starting from garbage input defeats that.`,
    };
  }

  // This bridge has no real geocoder — it can only ever honestly claim "approximate" placement, never
  // pretend to be google/nominatim/places/civic-quality geocoding it never actually performed.
  if (collection === "providers" && "geo" in updates) {
    const geo = updates.geo as Record<string, unknown> | undefined;
    if (typeof geo !== "object" || geo === null || geo.source !== "approximate") {
      return {
        ok: false,
        status: 400,
        error: 'geo.source must be "approximate" when writing geo through this bridge — this bridge has no real geocoder, so any other source value would misrepresent how the pin was placed.',
      };
    }
  }

  if (collection === "serviceLeads" && "status" in updates) {
    if (!(FAMILY_SERVICE_LEAD_STATUSES as readonly string[]).includes(updates.status as string)) {
      return { ok: false, status: 400, error: `status must be one of: ${FAMILY_SERVICE_LEAD_STATUSES.join(", ")}` };
    }
  }

  if (collection === "contentCards" && "state" in updates) {
    if (updates.state === "PUBLISHED") {
      return {
        ok: false,
        status: 400,
        error: 'state cannot be set to "PUBLISHED" through this bridge — publishing requires the main app\'s full gate (dedupe, schema validation, image pipeline, safe-publish flags), which this bridge does not replicate. Set state to "REVIEW_READY" instead and publish through the main app.',
      };
    }
    if (!(BRIDGE_SETTABLE_STATES as readonly string[]).includes(updates.state as string)) {
      return { ok: false, status: 400, error: `state must be one of: ${BRIDGE_SETTABLE_STATES.join(", ")}` };
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

  // (2026-08-08) Re-sourcing a content card. Stricter than the image check above, because sourceUrl is
  // the EVIDENCE a card is judged against: every later reality check reads it, and the per-domain sweep
  // groups duplicate clusters by the host derived from it. A malformed value would not just look wrong,
  // it would quietly remove the card from its own cluster.
  if (collection === "contentCards" && "sourceUrl" in updates) {
    const value = updates.sourceUrl;
    if (typeof value !== "string") {
      return { ok: false, status: 400, error: "sourceUrl must be a string" };
    }
    const parsed = parseSourceUrl(value);
    if (!parsed) {
      return {
        ok: false,
        status: 400,
        error: `sourceUrl must be a parseable https:// URL with a real hostname — got ${JSON.stringify(value)}. Re-source to a page that actually evidences THIS specific location (a branch page, not a franchise root domain and not a third-party directory listing).`,
      };
    }
  }

  // dryRun defaults to true — a write only actually applies when the caller explicitly passes false.
  const dryRun = b.dryRun !== false;

  return { ok: true, value: { collection, id: b.id, updates, reason: b.reason, source: b.source, dryRun, touch } };
}

export interface WriteOutcome {
  found: boolean;
  dryRun: boolean;
  touch: boolean;
  collection: BridgeCollectionKey;
  id: string;
  before?: Record<string, unknown>;
  applied?: Record<string, unknown>;
  auditId?: string;
  /** Set (found=true, nothing written, even in apply mode) when a serviceLeads write tried to move
   *  the lead to a public status (approved_support_only / approved_for_publication) while it still
   *  carries an unresolved blocker. Checked in dry-run too, so this surfaces before commit. */
  blockedReason?: string;
  /** Present only for serviceLeads writes — the place fact (and, when eligible, review packet) that
   *  were upserted as a consequence of this lead write, mirroring the main app's own
   *  upsertFamilyServicePlaceFacts/upsertFamilyServiceReviewPackets cascade. Absent in dry-run. */
  cascaded?: { placeFactId: string; reviewPacketId?: string };
}

/** Applies (or dry-runs) an already-validated write. Assumes `validateWriteRequest` already passed. */
export async function applyCardBridgeWrite(request: NormalizedWriteRequest): Promise<WriteOutcome> {
  const config = BRIDGE_REGISTRY[request.collection];
  const db = getBridgeDb();
  const collection = db.collection(config.mongoCollection);

  const current = await collection.findOne({ [config.idField]: request.id });
  if (!current) {
    return { found: false, dryRun: request.dryRun, touch: request.touch, collection: request.collection, id: request.id };
  }

  const before: Record<string, unknown> = {};
  for (const key of Object.keys(request.updates)) before[key] = current[key] ?? null;

  // serviceLeads: visibility and blockers are NEVER taken from the caller — always re-derived from
  // the ported normalizeFamilyServiceLead, exactly like the main app does. Checked in BOTH dry-run and
  // apply, because the public-status-with-blockers safeguard needs to surface before commit, not after.
  let normalizedLead: FamilyServiceLead | undefined;
  if (request.collection === "serviceLeads") {
    const merged = { ...(current as unknown as FamilyServiceLead), ...request.updates } as FamilyServiceLead;
    normalizedLead = normalizeFamilyServiceLead(merged, "<now>");
    if (isPublicStatus(normalizedLead.status) && normalizedLead.blockers && normalizedLead.blockers.length > 0) {
      return {
        found: true,
        dryRun: request.dryRun,
        touch: request.touch,
        collection: request.collection,
        id: request.id,
        before,
        blockedReason: `Cannot set status="${normalizedLead.status}" (a public status) while blockers exist: ${normalizedLead.blockers.join(", ")}. Resolve the blockers first (they are re-derived, not settable directly).`,
      };
    }
  }

  // Never-downgrade safeguard: this bridge can only add approximate geocoding where none exists, never
  // overwrite a real geocoder's better-quality pin. Checked in BOTH dry-run and apply — same convention
  // as the serviceLeads blocker check above — so this surfaces before commit, not after.
  if (request.collection === "providers" && "geo" in request.updates) {
    const currentPrecision = (current.geo as { precision?: string } | undefined)?.precision;
    const incomingPrecision = (request.updates.geo as { precision?: string } | undefined)?.precision;
    const currentIsBetter = currentPrecision === "exact" || currentPrecision === "interpolated";
    const incomingIsBetter = incomingPrecision === "exact" || incomingPrecision === "interpolated";
    if (currentIsBetter && !incomingIsBetter) {
      return {
        found: true,
        dryRun: request.dryRun,
        touch: request.touch,
        collection: request.collection,
        id: request.id,
        before,
        blockedReason: `Cannot overwrite existing geo (precision="${currentPrecision}") with a lower-confidence pin (precision="${incomingPrecision ?? "missing"}") through this bridge — this bridge may only add approximate geocoding where none exists, never downgrade a real geocoder's output.`,
      };
    }
  }

  // Top-3 activity alignment (owner directive, 2026-08-07): whenever a providers write touches
  // activityTypes and/or primaryActivityType, recompute BOTH from the full picture (incoming update
  // falling back to the current document) rather than trusting the caller's raw array order or a
  // stale primaryActivityType — see activityAlignment.ts for the real reasoning (primary activity
  // first, only same-cluster activities kept, capped at 3). Checked in BOTH dry-run and apply, same
  // convention as the serviceLeads/geo guards above, so the realigned result is visible before commit.
  // (2026-08-08) Re-sourcing derives sourceHost rather than trusting/accepting it from the caller, so a
  // card can never end up with a host that disagrees with its own URL. Computed here (not in
  // validation) so it shows up in the dry-run preview alongside every other derived field -- the loop's
  // convention is that a dry-run shows exactly what an apply would write.
  let derivedSourceHost: string | undefined;
  if (request.collection === "contentCards" && typeof request.updates.sourceUrl === "string") {
    derivedSourceHost = parseSourceUrl(request.updates.sourceUrl)?.host;
  }

  // (2026-08-08, from PR review) `fingerprint` is a hash of title + sourceUrl + categoryHint +
  // boroughGuess + neighborhoodGuess, and the real collection's unique index is {fingerprint, kind} --
  // that index, not contentCardId, is what stops discovery re-inserting a card it has already seen.
  // Every one of those five basis fields is writable through this bridge, so ANY of them changing
  // leaves the stored fingerprint describing a card that no longer exists: discovery re-encounters the
  // corrected page, computes a different hash, matches nothing, and inserts a duplicate. Re-sourcing
  // made this easy to notice, but it was already true of the other four fields before sourceUrl became
  // writable -- so the fix is keyed on the basis as a whole, not on sourceUrl.
  //
  // `contentCardId` is deliberately NOT recomputed even though it is literally `cc-${fingerprint}`.
  // It is the document's primary key and is referenced from the audit log and from anything that has
  // already linked to this card; changing it would be a delete-and-recreate, which this bridge does not
  // do (its only insert path is POST /split, with its own safety rails). The dedupe invariant lives on
  // the index, and the index is on {fingerprint, kind}, so keeping the fingerprint honest is what
  // actually matters. The consequence -- an id whose hash suffix no longer matches its own fingerprint
  // -- is cosmetic and is recorded here so nobody "fixes" it later by mutating the key.
  let derivedIdentity: { fingerprint: string; normalizedTitle: string } | undefined;
  if (request.collection === "contentCards" && FINGERPRINT_BASIS_FIELDS.some((field) => field in request.updates)) {
    const pick = (field: string) => String((request.updates[field] ?? current[field] ?? "") as string);
    const identity = computeContentCardIdentity({
      title: pick("title"),
      sourceUrl: pick("sourceUrl"),
      categoryHint: pick("categoryHint"),
      boroughGuess: pick("boroughGuess"),
      neighborhoodGuess: pick("neighborhoodGuess"),
    });
    if (identity.fingerprint !== current.fingerprint) {
      // A collision here is not a hash accident: it means another card already carries exactly the
      // identity this edit is moving toward, i.e. the two records are the same card. Surfacing that as
      // a blocked write is strictly better than letting the unique index reject the update with a
      // driver-level error, and better than silently skipping the recompute and leaving the index
      // stale. The reviewer's own duplicate-on-re-source scenario ends here instead of in the data.
      const clash = await collection.findOne({ fingerprint: identity.fingerprint, kind: current.kind ?? "content" });
      if (clash && clash[config.idField] !== request.id) {
        return {
          found: true,
          dryRun: request.dryRun,
          touch: request.touch,
          collection: request.collection,
          id: request.id,
          before,
          blockedReason: `This edit would give ${request.id} the same {fingerprint, kind} as the existing card ${String(clash[config.idField])} — they would be the same card, and the collection's unique index would reject the write. Reconcile the two records first (keep one as canonical, mark the other BLOCKED_TERMINAL as a duplicate) rather than editing this one into a collision.`,
        };
      }
      derivedIdentity = { fingerprint: identity.fingerprint, normalizedTitle: identity.normalizedTitle };
    }
  }

  let activityAlignment: ReturnType<typeof alignActivityTypes> | undefined;
  if (request.collection === "providers" && ("activityTypes" in request.updates || "primaryActivityType" in request.updates)) {
    const candidateActivityTypes = (request.updates.activityTypes as string[] | undefined) ?? (current.activityTypes as string[] | undefined) ?? [];
    const candidatePrimary = (request.updates.primaryActivityType as string | undefined) ?? (current.primaryActivityType as string | undefined);
    const title = (request.updates.name as string | undefined) ?? (current.name as string | undefined);
    activityAlignment = alignActivityTypes({ activityTypes: candidateActivityTypes, primaryActivityType: candidatePrimary, title });
  }

  if (request.dryRun) {
    const previewExtra =
      request.collection === "serviceLeads" && normalizedLead
        ? { visibility: normalizedLead.visibility, blockers: normalizedLead.blockers, tags: normalizedLead.tags }
        : {};
    const alignmentExtra = activityAlignment
      ? { activityTypes: activityAlignment.activityTypes, primaryActivityType: activityAlignment.primaryActivityType, activityTypesDropped: activityAlignment.dropped }
      : {};
    const sourceHostExtra = {
      ...(derivedSourceHost ? { sourceHost: derivedSourceHost } : {}),
      ...(derivedIdentity ?? {}),
    };
    return {
      found: true,
      dryRun: true,
      touch: request.touch,
      collection: request.collection,
      id: request.id,
      before,
      // Even in dry-run, show what a touch would actually stamp — so the caller can verify the
      // no-op-content path before committing to it, same as any other write.
      applied: request.touch
        ? { ...request.updates, ...previewExtra, ...alignmentExtra, ...sourceHostExtra, updatedAt: "<now>", lastReviewedAt: "<now>", lastReviewedBy: request.source }
        : { ...request.updates, ...previewExtra, ...alignmentExtra, ...sourceHostExtra },
    };
  }

  const nowIso = new Date().toISOString();
  // lastReviewedAt/lastReviewedBy are stamped on EVERY applied write, touch or not — this is the
  // record that the improvement loop looked at this card, distinct from updatedAt (which anything
  // could have touched). `source` doubles as "who/what reviewed it" (e.g. "copy-quality-lane",
  // "manual-oldest-card-loop-2026-08-06").
  const finalUpdates: Record<string, unknown> = {
    ...request.updates,
    updatedAt: nowIso,
    lastReviewedAt: nowIso,
    lastReviewedBy: request.source,
  };

  // Mirror the main app's categoryReclassifiedFrom/At provenance convention (business-rules.md rule
  // re: board 44 F3) so a category change made through this bridge is reversible the same way.
  if (request.collection === "providers" && "category" in request.updates && current.category !== request.updates.category) {
    finalUpdates.categoryReclassifiedFrom = current.category;
    finalUpdates.categoryReclassifiedAt = nowIso;
  }

  if (request.collection === "serviceLeads" && normalizedLead) {
    finalUpdates.visibility = normalizedLead.visibility;
    finalUpdates.blockers = normalizedLead.blockers;
    finalUpdates.tags = normalizedLead.tags;
  }

  // Never trust the caller's raw activityTypes/primaryActivityType directly — always persist the
  // realigned result computed above, so the core app's own badge/banner pickers (which read exactly
  // these two persisted fields) can never end up with a mixed-category top-3 through this bridge.
  if (activityAlignment) {
    finalUpdates.activityTypes = activityAlignment.activityTypes;
    finalUpdates.primaryActivityType = activityAlignment.primaryActivityType;
  }

  // Keep sourceHost in lockstep with sourceUrl (see parseSourceUrl). Never taken from the caller.
  if (derivedSourceHost) {
    finalUpdates.sourceHost = derivedSourceHost;
  }

  // Keep {fingerprint, kind} — the collection's real dedupe index — honest whenever a basis field
  // changes. See the derivation above for why contentCardId is left alone.
  if (derivedIdentity) {
    finalUpdates.fingerprint = derivedIdentity.fingerprint;
    finalUpdates.normalizedTitle = derivedIdentity.normalizedTitle;
  }

  const auditId = randomUUID();
  await db.collection("cardBridgeAuditLog").insertOne({
    auditId,
    collection: request.collection,
    id: request.id,
    touch: request.touch,
    before,
    after: finalUpdates,
    reason: request.reason,
    source: request.source,
    appliedAt: nowIso,
  });

  await collection.updateOne({ [config.idField]: request.id }, { $set: finalUpdates });

  let cascaded: WriteOutcome["cascaded"];
  if (request.collection === "serviceLeads") {
    // Cascade exactly like upsertFamilyServicePlaceFacts/upsertFamilyServiceReviewPackets in the main
    // app: the place fact is always regenerated from the lead's new persisted state; a review packet
    // is upserted only when the lead's (new) status is review-eligible.
    const fullLead = { ...(current as unknown as FamilyServiceLead), ...finalUpdates } as FamilyServiceLead;
    const fact = buildFamilyServicePlaceFact(fullLead, nowIso);
    await db.collection("classscoutServicePlaceFacts").updateOne({ factId: fact.factId }, { $set: fact }, { upsert: true });
    cascaded = { placeFactId: fact.factId };
    if (reviewPacketEligible(fullLead.status)) {
      const packet = buildFamilyServiceReviewPacket(fullLead, nowIso);
      await db.collection("classscoutServiceReviewPackets").updateOne({ packetId: packet.packetId }, { $set: packet }, { upsert: true });
      cascaded.reviewPacketId = packet.packetId;
    }
  }

  return {
    found: true,
    dryRun: false,
    touch: request.touch,
    collection: request.collection,
    id: request.id,
    before,
    applied: finalUpdates,
    auditId,
    cascaded,
  };
}
