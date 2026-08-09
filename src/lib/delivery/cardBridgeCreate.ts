import { randomUUID } from "crypto";
import { getBridgeDb } from "@/lib/delivery/cardBridgeClient";
import { CATEGORY_VALUES } from "@/lib/delivery/cardBridgeRegistry";
import { validateCopyQuality } from "@/lib/validation/copyQuality";
import { alignActivityTypes } from "@/lib/delivery/activityAlignment";
import { categoryValueError, placeValueError } from "@/lib/delivery/fieldGuards";
import { isImgBbHttpsImageUrl, providerPublishGate } from "@/lib/delivery/publishGate";
import { validateRecurringPrograms } from "@/lib/delivery/programSchema";
import { slugifyProviderName } from "@/lib/delivery/cardBridgeSplit";
import { expansionMarketKeys } from "@/lib/delivery/expansionMarkets";

/**
 * Creating a listing for a real business the catalogue does not have (2026-08-09, owner directive to
 * fill sport coverage in the scarcest Manhattan and Brooklyn neighbourhoods).
 *
 * Until now this bridge could create documents in exactly one way: `POST /split`, which needs a PARENT
 * to divide. That covers "this record is really several records" and nothing else. A genuinely new
 * business — found on the operator's own site, in a directory, anywhere — had no path in at all, and
 * the workaround (retitling an unrelated dead card onto it) would break fingerprint lineage and leave
 * an audit trail that lies about where the record came from.
 *
 * WHAT IS REQUIRED, AND WHY EACH ONE. This endpoint deliberately demands more than the update path,
 * because a create has no prior state to fall back on and an incomplete new listing is worse than no
 * listing: a family clicks it, finds nothing, and stops trusting the catalogue.
 *
 *   name, category, borough, address, website   — identity, format, place, and the source that proves it
 *   image                                        — owner directive: "the image is always required and
 *                                                  always has to be checked and added to the database".
 *                                                  Also the main app's own hard gate — a listing without
 *                                                  an imgbb-hosted image is invisible, so creating one
 *                                                  without an image manufactures an invisible record.
 *   shortDescription, longDescription            — the enrichment mandate. A new listing with placeholder
 *                                                  copy is precisely the defect this loop spends its time
 *                                                  removing; it should not be creating more.
 *
 * WHAT IS CHECKED AGAINST THE REST OF THE CATALOGUE. Three collision checks, each one a defect this repo
 * has already found the hard way and is now refusing to create fresh instances of:
 *
 *   id       — `providers.id` has NO uniqueness constraint in the database. Nothing else catches this.
 *   address  — a street address another live listing already holds is a duplicate or a programme card.
 *              The address-fill pipeline's refusals "were all real findings"; this is the same test
 *              applied before insert rather than after.
 *   image    — 63 live records share 16 image files, one banner on 14 of them. A shared image is not a
 *              photograph of the place a family is deciding to walk to. A new listing must bring its own.
 *
 * VISIBILITY IS DERIVED, NEVER PASSED. The caller does not get to say whether the listing is public: the
 * record is run through `providerPublishGate` — the faithful port of the main app's own `isPublicProvider`
 * — and is created visible only if it passes in full, hidden otherwise, with the unmet requirements
 * returned. That keeps the publish decision as the gate's, not the caller's.
 */

const MIN_REASON_LENGTH = 5;

export interface CreateProviderInput {
  name?: unknown;
  category?: unknown;
  programType?: unknown;
  borough?: unknown;
  neighborhood?: unknown;
  address?: unknown;
  website?: unknown;
  image?: unknown;
  activityTypes?: unknown;
  shortDescription?: unknown;
  longDescription?: unknown;
  phone?: unknown;
  email?: unknown;
  ageRanges?: unknown;
  recurringPrograms?: unknown;
  city?: unknown;
}

export interface NormalizedCreateRequest {
  provider: CreateProviderInput;
  reason: string;
  source: string;
  dryRun: boolean;
}

export type CreateValidationResult =
  | { ok: true; value: NormalizedCreateRequest }
  | { ok: false; status: 400; error: string };

/** Pure validation — no I/O. The collision checks that need the database live in the apply path. */
export function validateCreateRequest(body: unknown): CreateValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (b.collection !== undefined && b.collection !== "providers") {
    return { ok: false, status: 400, error: 'Only collection "providers" can be created through this bridge. A content card is created by the main app\'s own discovery pipeline; creating one here would fabricate a discovery that never happened.' };
  }
  if (typeof b.provider !== "object" || b.provider === null || Array.isArray(b.provider)) {
    return { ok: false, status: 400, error: "provider must be a JSON object" };
  }
  const p = b.provider as Record<string, unknown>;

  const text = (key: string): string => (typeof p[key] === "string" ? (p[key] as string).trim() : "");

  for (const key of ["name", "address", "shortDescription", "longDescription"]) {
    if (!text(key)) return { ok: false, status: 400, error: `provider.${key} is required and must be a non-empty string` };
  }
  if (!(CATEGORY_VALUES as readonly string[]).includes(text("category"))) {
    return { ok: false, status: 400, error: `provider.category must be one of: ${CATEGORY_VALUES.join(", ")}` };
  }
  if (!/^https:\/\/\S{6,}$/i.test(text("website"))) {
    return { ok: false, status: 400, error: "provider.website must be a real https:// URL — the source that evidences this business exists" };
  }
  if (!isImgBbHttpsImageUrl(p.image)) {
    return {
      ok: false,
      status: 400,
      error: "provider.image is required and must be an https imgbb URL (https://i.ibb.co/...). The main app shows no listing without its own image, so a listing created without one is invisible by construction. Upload the venue's own photograph rather than reusing another listing's.",
    };
  }

  for (const key of ["borough", "neighborhood"] as const) {
    if (key === "borough" && !text(key)) {
      return { ok: false, status: 400, error: "provider.borough is required" };
    }
    const err = placeValueError(p[key]);
    if (err) return { ok: false, status: 400, error: `provider.${key} ${err}` };
  }

  for (const key of ["category", "activityTypes"] as const) {
    const err = categoryValueError(p[key]);
    if (err) return { ok: false, status: 400, error: `provider.${key} ${err}` };
  }
  if (p.activityTypes !== undefined && (!Array.isArray(p.activityTypes) || !p.activityTypes.every((a) => typeof a === "string"))) {
    return { ok: false, status: 400, error: "provider.activityTypes must be an array of strings" };
  }

  for (const key of ["shortDescription", "longDescription"] as const) {
    const copyError = validateCopyQuality(text(key), key);
    if (copyError) return { ok: false, status: 400, error: `provider.${copyError}` };
  }

  if (p.recurringPrograms !== undefined) {
    const check = validateRecurringPrograms(p.recurringPrograms);
    if (!check.ok) return { ok: false, status: 400, error: check.error ?? "provider.recurringPrograms is invalid" };
  }

  if (p.city !== undefined) {
    const allowed = ["nyc", "la", ...expansionMarketKeys()];
    if (typeof p.city !== "string" || !allowed.includes(p.city)) {
      return { ok: false, status: 400, error: `provider.city must be one of: ${allowed.join(", ")}` };
    }
  }

  if (typeof b.reason !== "string" || b.reason.trim().length < MIN_REASON_LENGTH) {
    return { ok: false, status: 400, error: `reason must be a string of at least ${MIN_REASON_LENGTH} characters` };
  }
  if (typeof b.source !== "string" || !b.source.trim()) {
    return { ok: false, status: 400, error: "source must be a non-empty string (who/what is making this change)" };
  }

  return { ok: true, value: { provider: p, reason: b.reason, source: b.source, dryRun: b.dryRun !== false } };
}

export interface CreateOutcome {
  created: boolean;
  dryRun: boolean;
  id?: string;
  document?: Record<string, unknown>;
  /** Empty when the new listing is publicly visible; otherwise every unmet gate requirement. */
  publishGateMissing?: string[];
  blockedReason?: string;
  auditId?: string;
}

/** Normalises a street address for the duplicate check. Mirrors `src/scripts/addressClusters.ts`'s
 *  `normalizeStreetAddress`, including keeping the leading house number — Chelsea Piers is three real
 *  venues at 61, 62 and Pier 59, and folding them together would merge three places into one. */
function normalizeStreetAddress(address: string): string | null {
  const SUFFIX: Record<string, string> = {
    street: "st", str: "st", avenue: "ave", av: "ave", road: "rd", boulevard: "blvd",
    place: "pl", drive: "dr", court: "ct", lane: "ln", parkway: "pkwy", terrace: "ter",
  };
  let a = address.toLowerCase().trim();
  if (!a || !/\d/.test(a)) return null; // no house number: a placeholder, shared by design
  a = a.replace(/,?\s*(?:new york|ny|brooklyn|bronx|queens|staten island|nyc)\b/g, " ");
  a = a.replace(/\b1[01]\d{3}\b/g, " ").replace(/[^a-z0-9 ]/g, " ");
  return a.split(/\s+/).filter(Boolean).map((w) => SUFFIX[w] ?? w).join(" ") || null;
}

export async function applyCardBridgeCreate(request: NormalizedCreateRequest): Promise<CreateOutcome> {
  const db = getBridgeDb();
  const p = request.provider;
  const text = (key: keyof CreateProviderInput): string => (typeof p[key] === "string" ? (p[key] as string).trim() : "");

  // --- Collision checks against the live catalogue. Each one is a defect already found in real data.
  const normalized = normalizeStreetAddress(text("address"));
  if (normalized) {
    // Compared on the NORMALISED form, so "9941 Fort Hamilton Pkwy" and "9941 Fort Hamilton Parkway,
    // Brooklyn, NY 11209" are recognised as one address. That cannot be expressed as a Mongo equality,
    // hence the scan — the live pool is ~700 documents projected to three fields.
    const rows = await db.collection("providers")
      .find({ visibility: { $ne: "hidden" }, qualityStatus: { $ne: "quarantined" } }, { projection: { id: 1, name: 1, address: 1 } })
      .toArray();
    const clash = rows.find((r) => typeof r.address === "string" && normalizeStreetAddress(r.address) === normalized);
    if (clash) {
      return {
        created: false,
        dryRun: request.dryRun,
        blockedReason: `A live listing already holds this street address: "${clash.name}" (${clash.id}). Either this is the same venue — in which case enrich that record instead of creating a second one — or it is a different business in the same building, which needs a distinguishing address (suite, floor, pier).`,
      };
    }
  }

  const imageClash = await db.collection("providers").findOne(
    { image: text("image"), visibility: { $ne: "hidden" } },
    { projection: { id: 1, name: 1 } },
  );
  if (imageClash) {
    return {
      created: false,
      dryRun: request.dryRun,
      blockedReason: `That image is already used by "${imageClash.name}" (${imageClash.id}). A listing's image is a photograph of the place a family is deciding to walk to; sharing one between two businesses misrepresents both. Upload this venue's own photo.`,
    };
  }

  let id = `prov-${slugifyProviderName(text("name"))}`;
  let attempt = 1;
  // providers.id has no uniqueness constraint in the database — this check is the only thing between a
  // create and silently colliding with an existing record.
  while (await db.collection("providers").findOne({ id })) {
    attempt += 1;
    if (attempt > 20) return { created: false, dryRun: request.dryRun, blockedReason: `Could not generate a unique provider id for "${text("name")}" after 20 attempts` };
    id = `prov-${slugifyProviderName(text("name"))}-${attempt}`;
  }

  const aligned = alignActivityTypes({
    activityTypes: Array.isArray(p.activityTypes) ? (p.activityTypes as string[]) : [],
    title: text("name"),
  });

  const nowIso = new Date().toISOString();
  const doc: Record<string, unknown> = {
    id,
    name: text("name"),
    category: text("category"),
    programType: text("programType") || text("category"),
    borough: text("borough"),
    neighborhood: text("neighborhood"),
    address: text("address"),
    website: text("website"),
    sourceUrls: [text("website")],
    image: text("image"),
    activityTypes: aligned.activityTypes,
    primaryActivityType: aligned.primaryActivityType,
    shortDescription: text("shortDescription"),
    longDescription: text("longDescription"),
    city: text("city") || "nyc",
    incompleteFields: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    lastReviewedAt: nowIso,
    lastReviewedBy: request.source,
    bridgeCreatedAt: nowIso,
    bridgeCreateReason: request.reason,
  };
  if (text("phone")) doc.phone = text("phone");
  if (text("email")) doc.email = text("email");
  if (Array.isArray(p.ageRanges)) doc.ageRanges = p.ageRanges;
  if (Array.isArray(p.recurringPrograms)) doc.recurringPrograms = p.recurringPrograms;

  // Visibility is DERIVED from the gate, never taken from the caller.
  const gate = providerPublishGate(doc);
  doc.visibility = gate.ok ? "visible" : "hidden";
  if (gate.ok) doc.publishedAt = nowIso;

  if (request.dryRun) {
    return { created: false, dryRun: true, id, document: doc, publishGateMissing: gate.missing };
  }

  await db.collection("providers").insertOne(doc as never);
  const auditId = randomUUID();
  await db.collection("cardBridgeAuditLog").insertOne({
    auditId,
    action: "create",
    collection: "providers",
    id,
    before: null,
    after: doc,
    reason: request.reason,
    source: request.source,
    appliedAt: nowIso,
  });

  return { created: true, dryRun: false, id, document: doc, publishGateMissing: gate.missing, auditId };
}
