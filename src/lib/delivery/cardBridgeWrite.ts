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
import { alignActivityTypes } from "@/lib/delivery/activityAlignment";
import { categoryValueError, placeValueError } from "@/lib/delivery/fieldGuards";
import { providerPublishGate } from "@/lib/delivery/publishGate";
import { mergeFieldVerifications } from "@/lib/delivery/fieldVerifications";
import { findExpansionDistrict, expansionMarketKeys } from "@/lib/delivery/expansionMarkets";
import { computeContentCardIdentity } from "@/lib/delivery/cardBridgeSplit";
import { monthsToAgeBuckets, validateRecurringPrograms } from "@/lib/delivery/programSchema";
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
  //
  // (2026-08-08, owner-reported from the live Kinder Prep Montessori card) The same rule in a second
  // vocabulary. "Multi-category", "Multi-enrichment", "Preschool / Multi-enrichment" are the pipeline
  // recording that it could not classify the listing — in the owner's words, "a technical leak, not
  // something informal for a parent". It reached a family's card as the LEAD chip. Blocked here rather
  // than only in alignActivityTypes, because that only covers providers.activityTypes and this arrived
  // through categoryHint.
  //
  // (2026-08-09) Both checks now live in `fieldGuards.ts` and are shared with the SPLIT path, which had
  // neither of them — see that module's header for why the one path that creates documents was also the
  // one path that could create these values.
  const placeholderFields = ["category", "categoryHint", "primaryActivityType", "activityTypes"] as const;
  for (const field of placeholderFields) {
    if (!(field in updates)) continue;
    const error = categoryValueError(updates[field]);
    if (error) return { ok: false, status: 400, error: `${field} ${error}` };
  }

  // (2026-08-08) recurringPrograms was a BARE PASSTHROUGH -- writable as a whole array with no shape
  // validation at all, which is exactly what this repo's own convention forbids. It now carries the
  // structured programme schema (times, ages in months, price with an evidence enum), so a malformed value
  // is no longer a cosmetic problem: it feeds the per-day query. Legacy entries validate unchanged --
  // every new field is optional and only checked when present. See programSchema.ts.
  if (collection === "providers" && "recurringPrograms" in updates) {
    const programCheck = validateRecurringPrograms(updates.recurringPrograms);
    if (!programCheck.ok) {
      return { ok: false, status: 400, error: programCheck.error ?? "recurringPrograms is invalid" };
    }
  }

  // (2026-08-08) A place field must name ONE PLACE. This is the same class of rule as the "no category"
  // placeholder above -- a value that is syntactically a string but semantically not an answer -- and it
  // was added after the five-card sovereign loop found `boroughGuess: "Manhattan/Brooklyn"` on every card
  // of one discovery run. Two distinct shapes recur, both documented across dozens of real records:
  //
  //   COMPOUND -- "Manhattan/Brooklyn", "Coney Island / Bensonhurst", "Upper West Side / Harlem",
  //   "NYC / Long Island", "Multiple". Naming two places is not narrowing to one; it hides a SPLIT (British
  //   Swim School's "Manhattan/Brooklyn" was concealing two separate franchises) and it reads to a family
  //   as though the business is in both.
  //
  //   DELIVERY MODEL -- "NYC-wide", "Citywide", "Mobile / Brooklyn", "Park Slope / mobile", "Multiple
  //   locations", "Virtual", "Online". These answer "how is it delivered", not "where is it". A business
  //   with no fixed venue is prohibited outright by the physical-only rule, so writing its delivery model
  //   into a place field launders a prohibition into a location.
  //
  // Deliberately NOT rejected: an EMPTY value. Clearing a place field is how a reviewer records an honest
  // absence when no single answer exists, and that must stay available -- an empty field is better than a
  // wrong one, which is the whole reason this check exists.
  const placeFields = ["borough", "boroughGuess", "neighborhood", "neighborhoodGuess"] as const;
  // `\bor\b` was missing until 2026-08-09 and the gap was live: THIRTEEN providers carried
  // "Manhattan or Brooklyn", the write path accepted it, and a doc claiming it was "rejected on write"
  // had to be corrected. A guard is only as good as the separators it lists — when a new compound
  // shape turns up in the data, add it here rather than only cleaning the rows.
  // Separators found in live data, each added after it turned up: `/`, `and`, `&`, `+`; then `or`, `;`,
  // `|` (2026-08-09, after "Manhattan or Brooklyn" sat on 13 providers while a doc claimed it was
  // blocked); then `,` the same day, when the owner's restatement of the rule prompted a full sweep of
  // separator shapes and "Manhattan, Brooklyn" was still getting through. No canonical place name in
  // either the NYC or LA vocabulary contains any of them, which is asserted by a test over all 341.
  // The separator list itself now lives in `fieldGuards.placeValueError`, shared with the SPLIT path.
  for (const field of placeFields) {
    if (!(field in updates)) continue;
    const error = placeValueError(updates[field]);
    if (error) return { ok: false, status: 400, error: `${field} ${error}` };
  }

  // ------------------------------------------------------------------------------------------------
  // The one-directional rails on `qualityStatus` and `visibility`, and the SINGLE exception to them.
  //
  // These fields have always been DEFENSIVE-only through this bridge: a write may hide or quarantine a
  // record, never reveal one, because revealing is the main app's own gate to open and this bridge does
  // not replicate it. That rail is right and stays.
  //
  // The exception, added 2026-08-09 on an explicit owner directive: *"Out of existing city, out of
  // borough, out of neighbourhoods but real, legit listings should be built properly, create the missing
  // city, borough (district), neighbourhoods for that."*
  //
  // This loop had hidden real, confirmed children's programmes for one reason and one reason only — the
  // place they are in had no value in the taxonomy. 92NY's Camp Yomi, a 50-acre day camp in Rockland
  // County with bus service from Manhattan, was retired for having an address. Camp Yomawha at the Henry
  // Kaufmann Campgrounds in Pearl River was quarantined for the same. Those are not content judgements
  // and the owner has now supplied the missing vocabulary, so the records must be able to come back.
  //
  // The exception is deliberately narrow and self-limiting: a record may be un-hidden or un-quarantined
  // ONLY in the same write that places it in an expansion market whose district actually resolves. That
  // means the write can only reverse the specific defect the owner authorised fixing — it cannot revive
  // a record quarantined for being off-topic, fabricated, adults-only, closed or without a fixed venue,
  // because none of those writes has a resolvable out-of-borough district to offer. There is no other
  // path back from hidden through this bridge.
  // ------------------------------------------------------------------------------------------------
  const reinstatementDistrict =
    typeof updates.borough === "string" && expansionMarketKeys().some((k) => findExpansionDistrict(k, updates.borough as string))
      ? (updates.borough as string)
      : null;

  // ------------------------------------------------------------------------------------------------
  // THE SECOND EXCEPTION (2026-08-09, owner-approved): the publish gate, IMPLEMENTED rather than avoided.
  //
  // The original rail said revealing is "the main app's own gate to open and this bridge does not
  // replicate it." That was right about the risk and wrong about the conclusion — the gate is ordinary,
  // readable, deterministic logic (`isPublicProvider`), and refusing to replicate it left fully-researched
  // real listings permanently invisible with no path forward short of hand-editing the database.
  //
  // A reveal is therefore allowed only when the record, AS IT WILL BE AFTER THIS WRITE, passes the ported
  // gate in FULL — imgbb image, name, category, location, source URL, no scraped chrome, not quarantined.
  // That check needs the stored document, so validation only records the intent; `applyCardBridgeWrite`
  // runs `providerPublishGate` over the merged record and refuses with `blockedReason` if it fails.
  // Nothing about it is a judgement call, which is precisely why it can live here.
  //
  // `meetupGroups` is NOT covered: its public gate is a different function over a different shape, and
  // porting a gate for a collection this loop does not enrich would be speculative.
  // ------------------------------------------------------------------------------------------------
  const revealAllowedForCollection = collection === "providers";

  if ((collection === "providers" || collection === "meetupGroups") && "qualityStatus" in updates && updates.qualityStatus !== "quarantined") {
    if (updates.qualityStatus === "" && (reinstatementDistrict || revealAllowedForCollection)) {
      // allowed: taxonomy-gap reinstatement, or a gate-checked reveal (verified at apply time)
    } else {
      return { ok: false, status: 400, error: `qualityStatus can only be set to "quarantined" through this bridge, cleared to "" on a providers record that passes the public gate, or cleared in the same write that places the record in a resolvable expansion-market district.` };
    }
  }

  // `city` is the tenant key. A mistyped one does not error anywhere downstream — it silently drops the
  // record out of every view — so it is validated against a closed list here rather than trusted.
  if ("city" in updates) {
    const city = String(updates.city ?? "").trim().toLowerCase();
    const known = ["nyc", "la", ...expansionMarketKeys()];
    if (!known.includes(city)) {
      return { ok: false, status: 400, error: `city must be one of: ${known.join(", ")} — got ${JSON.stringify(updates.city)}. A tenant key that matches nothing removes the record from every view without erroring.` };
    }
  }

  // Per-field verification provenance (owner-approved 2026-08-09). Shape is checked here so a malformed
  // payload is a 400 before anything touches the database; the merge against the record's EXISTING
  // entries happens in applyCardBridgeWrite, because only that has the current document.
  if ("fieldVerifications" in updates) {
    const fv = updates.fieldVerifications;
    if (!Array.isArray(fv) || fv.length === 0) {
      return { ok: false, status: 400, error: "fieldVerifications must be a non-empty array of {field, verdict, source?} entries" };
    }
    const probe = mergeFieldVerifications([], fv as never, "validate", "1970-01-01T00:00:00.000Z", BRIDGE_REGISTRY[collection].writableFields);
    if (!probe.ok) return { ok: false, status: 400, error: probe.error! };
  }
  if ((collection === "providers" || collection === "meetupGroups") && "visibility" in updates && updates.visibility !== "hidden") {
    const revealing = updates.visibility === "" || updates.visibility === "visible";
    if (revealing && (reinstatementDistrict || revealAllowedForCollection)) {
      // allowed: taxonomy-gap reinstatement, or a gate-checked reveal (verified at apply time)
    } else {
      return { ok: false, status: 400, error: `visibility can only be set to "hidden" through this bridge, or to "" / "visible" on a providers record that passes the main app's own public gate (imgbb image, name, category, location, source URL, no scraped chrome). Got ${JSON.stringify(updates.visibility)}.` };
    }
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

  // (2026-08-09) This used to accept ONLY `source: "approximate"`, on the stated grounds that "this
  // bridge has no real geocoder". That premise is now false: the loop geocodes street addresses against
  // Nominatim, which is the same service the existing live pins were produced by (`source: "nominatim"`
  // appears on real records today). Widening the rule because its reason stopped being true is the same
  // discipline this repo applies to clearing a blocker — the premise has to be false, not merely
  // inconvenient.
  //
  // WHY THIS MATTERED. Listings created by this bridge carried no `geo` at all, and the map viewport is a
  // real FILTER rather than a display hint. So a listing with a perfect street address was absent from
  // the map and from any map-bounded browse, while 232 of 394 live listings had pins. That is what
  // "I don't see the results online" looked like from the outside.
  //
  // Two things are still refused, and both are load-bearing:
  //   - a source this bridge cannot actually perform (anything but `approximate` or `nominatim`);
  //   - a CENTROID-GRADE pin. `precision` must be `exact` or `interpolated` for a nominatim pin, because
  //     a neighbourhood centroid dressed as a geocode puts a confident marker on a street the business
  //     is not on — already recorded here as worse than no pin at all, with seven live listings sharing
  //     one Upper East Side point. A nominatim result that only resolves to a neighbourhood must be
  //     dropped, not written.
  if (collection === "providers" && "geo" in updates) {
    const geo = updates.geo as Record<string, unknown> | undefined;
    if (typeof geo !== "object" || geo === null) {
      return { ok: false, status: 400, error: "geo must be an object with lat, lng, precision and source" };
    }
    const allowedSources = ["approximate", "nominatim"];
    if (typeof geo.source !== "string" || !allowedSources.includes(geo.source)) {
      return {
        ok: false,
        status: 400,
        error: `geo.source must be one of: ${allowedSources.join(", ")} — anything else would misrepresent how the pin was placed, because those are the only two this bridge can actually perform.`,
      };
    }
    if (geo.source === "nominatim" && geo.precision !== "exact" && geo.precision !== "interpolated") {
      return {
        ok: false,
        status: 400,
        error: 'a geo with source "nominatim" must have precision "exact" or "interpolated". A coarser match is a neighbourhood centroid, and a centroid dressed as a geocode puts a confident marker on a street the business is not on — drop the pin instead.',
      };
    }
    if (typeof geo.lat !== "number" || typeof geo.lng !== "number"
        || geo.lat < -90 || geo.lat > 90 || geo.lng < -180 || geo.lng > 180) {
      return { ok: false, status: 400, error: "geo.lat and geo.lng must be numbers in range" };
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

  // (2026-08-09) THE PUBLISH GATE, checked against the record as it will be AFTER this write.
  //
  // `validateWriteRequest` can allow the intent to reveal but cannot judge it: the gate reads the whole
  // document (image, name, category, location, source, copy) and validation is pure. So a reveal is
  // permitted through validation and adjudicated here, against {stored ∪ updates} — which is the only
  // form of the record that answers the actual question, "would a family see this?".
  //
  // Deliberately checked in BOTH dry-run and apply, like every other guard in this file: a dry-run that
  // reported success and an apply that refused would be worse than no dry-run at all.
  if (
    request.collection === "providers"
    && (("visibility" in request.updates && request.updates.visibility !== "hidden")
      || ("qualityStatus" in request.updates && request.updates.qualityStatus !== "quarantined"))
  ) {
    const merged = { ...(current as Record<string, unknown>), ...request.updates };
    // The gate reads these two as the record's own state; a reveal means they are being cleared.
    if ("visibility" in request.updates) merged.visibility = "";
    if ("qualityStatus" in request.updates) merged.qualityStatus = "";
    const gate = providerPublishGate(merged);
    if (!gate.ok) {
      return {
        found: true,
        dryRun: request.dryRun,
        touch: request.touch,
        collection: request.collection,
        id: request.id,
        before,
        blockedReason: `This write would reveal ${request.id}, but the record does not pass the main app's own public gate: ${gate.missing.join("; ")}. Fix those in the same write (or an earlier one) and the reveal is allowed — the gate is not a veto on revealing, it is the condition for it.`,
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

  // `recurringPrograms[].activityTypes` is a SECOND, independent activity list, and it renders to
  // families in the card's own "Recurring programs" block.
  //
  // (owner-reported 2026-08-08: "Recurring programs shows much more sports than the main part.") The
  // Flatbush YMCA card's top-level chip correctly read "SPORTS" after the taxonomy pass while the block
  // underneath still showed nine tags including the compound "SPORTS / CAMP" -- because aligning
  // `activityTypes` never touched the sub-documents. Worse, the ingestion placeholder survived here in
  // 184 live programs after being reported as cleared from the top-level field.
  //
  // Aligned whenever a providers write touches EITHER list, so the two can never drift apart again.
  let alignedRecurringPrograms: Record<string, unknown>[] | undefined;
  if (
    request.collection === "providers" &&
    ("recurringPrograms" in request.updates || activityAlignment !== undefined)
  ) {
    const programs = (request.updates.recurringPrograms as Record<string, unknown>[] | undefined)
      ?? (current.recurringPrograms as Record<string, unknown>[] | undefined);
    if (Array.isArray(programs)) {
      const providerName = (request.updates.name as string | undefined) ?? (current.name as string | undefined);
      alignedRecurringPrograms = programs.map((program) => {
        if (!program || typeof program !== "object" || !Array.isArray(program.activityTypes)) return program;
        // The program's own title is better evidence of what it is than the provider's, when present.
        const aligned = alignActivityTypes({
          activityTypes: program.activityTypes as string[],
          primaryActivityType: null,
          title: (program.title as string | undefined) || providerName,
        });
        return { ...program, activityTypes: aligned.activityTypes };
      });
    }
  }

  // Keep the five display buckets DERIVED from the numeric truth, so the two can never disagree. Months
  // are what a query uses; the buckets are what a card shows. The owner's own example -- "ages 8-12" --
  // straddles "6–8" and "9–12", so a hand-written bucket list would round outward and send a parent of an
  // eight-year-old to a class that starts at nine. Same pattern as alignActivityTypes: derive, don't trust.
  if (request.collection === "providers" && Array.isArray(alignedRecurringPrograms ?? request.updates.recurringPrograms)) {
    const source = (alignedRecurringPrograms ?? request.updates.recurringPrograms) as Record<string, unknown>[];
    alignedRecurringPrograms = source.map((program) => {
      if (!program || typeof program !== "object") return program;
      const min = program.ageMinMonths;
      const max = program.ageMaxMonths;
      if (typeof min !== "number" || typeof max !== "number") return program;
      return { ...program, ageRanges: monthsToAgeBuckets(min, max) };
    });
  }

  if (request.dryRun) {
    const previewExtra =
      request.collection === "serviceLeads" && normalizedLead
        ? { visibility: normalizedLead.visibility, blockers: normalizedLead.blockers, tags: normalizedLead.tags }
        : {};
    const alignmentExtra = {
      ...(activityAlignment
        ? { activityTypes: activityAlignment.activityTypes, primaryActivityType: activityAlignment.primaryActivityType, activityTypesDropped: activityAlignment.dropped }
        : {}),
      ...(alignedRecurringPrograms ? { recurringPrograms: alignedRecurringPrograms } : {}),
    };
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

  // Per-FIELD provenance (owner-approved 2026-08-09). Supplied explicitly by the caller as
  // `fieldVerifications: [{field, verdict, source?}]` and merged replace-by-field into whatever the
  // record already carries. Deliberately NOT derived from `request.updates`: a bulk sweep that sets a
  // field mechanically has established nothing, and stamping it as verified would manufacture exactly
  // the false confidence this exists to remove. A write that supplies none stamps none.
  if ("fieldVerifications" in request.updates) {
    const merged = mergeFieldVerifications(
      (current as Record<string, unknown>).fieldVerifications,
      request.updates.fieldVerifications as never,
      request.source,
      nowIso,
      config.writableFields,
    );
    if (!merged.ok) {
      // Refusals at apply time surface as `blockedReason`, matching every other guard in this file
      // (the fingerprint-collision and geo-downgrade checks). The shape is validated earlier in
      // validateWriteRequest; this catches what only the CURRENT record can reveal.
      return { found: true, dryRun: request.dryRun, touch: request.touch, collection: request.collection, id: request.id, before, blockedReason: merged.error };
    }
    finalUpdates.fieldVerifications = merged.value;
  }

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
  if (alignedRecurringPrograms) {
    finalUpdates.recurringPrograms = alignedRecurringPrograms;
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
