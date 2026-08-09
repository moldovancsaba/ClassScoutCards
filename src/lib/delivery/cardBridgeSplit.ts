import { createHash, randomUUID } from "crypto";
import { getBridgeDb } from "@/lib/delivery/cardBridgeClient";
import { CATEGORY_VALUES } from "@/lib/delivery/cardBridgeRegistry";
import { validateCopyQuality } from "@/lib/validation/copyQuality";
import { alignActivityTypes } from "@/lib/delivery/activityAlignment";
import { categoryValueError, placeValueError } from "@/lib/delivery/fieldGuards";

/**
 * Splitting one bad card into N real ones -- built 2026-08-07 after a 100-card review pass kept
 * surfacing three variants of the same underlying problem the update-only bridge had no way to fix:
 * a record with several real physical locations forced into one borough/neighborhood; an aggregator
 * page that actually lists N distinct real businesses extracted as if it were one; two real orgs'
 * facts mashed into a single record under one name. None of those are fixable by editing fields on
 * the ONE existing document -- they need to become N documents.
 *
 * The main `classscout` repo has no such mechanism at all (confirmed by reading its own code: a
 * `locationGroup.ts` comment states splitting one source into N cards "requires multi-location
 * extraction ... and is a follow-up", not yet built) -- so this is this repo's own addition, not a
 * port, built as carefully as the research into the real schema allowed:
 *
 * - contentCards' real `contentCardId`/`fingerprint` scheme (ported from `buildContentCardIdentityFromParts`
 *   in the main repo's contentCards.ts) is replicated exactly below so split-off cards get IDs
 *   indistinguishable from ones the real pipeline would have generated, and a genuine unique index on
 *   `{fingerprint, kind}` exists there -- collisions are checked and disambiguated before insert.
 * - providers' real `id` scheme (`prov-` + slugify(name), from classscoutAdapter.ts) has NO uniqueness
 *   constraint in the database at all -- collisions are checked by hand and disambiguated with a
 *   numeric suffix, since nothing else will catch it.
 * - A freshly-inserted contentCards document with `state: "DISCOVERED"` is exactly what the real
 *   pipeline's cron autopilot picks up and pushes through its own extract/score/gate cycle -- so a
 *   split-off content card only needs a genuinely distinguishing `sourceUrl` per child; the pipeline
 *   does the rest, through the same gate every other card goes through.
 * - providers is a different risk profile: it looks like the LIVE/public collection itself (dedup is
 *   enforced only at publish time, in app code, never at the DB layer), so a raw insert has no gate at
 *   all. Every split-off provider is therefore created with `visibility: "hidden"` FORCED, regardless
 *   of what the caller passes -- it can never go live through this bridge; a human has to explicitly
 *   un-hide it through the main app itself.
 * - Every child requires its OWN distinguishing source (`sourceUrl` for contentCards, `website` for
 *   providers) and no two children in the same split may share one -- this is what makes a split
 *   meaningfully different from just relisting the same bad source N times, and is what rules out
 *   "split" as a fix for a conflated-identity record UNLESS a real, separate source has actually been
 *   found for each identity (exactly the standard already used throughout this session's manual fixes).
 * - The parent is always updated LAST, only after every child has been generated and validated for
 *   uniqueness -- so a failure partway through never leaves the parent silently re-flagged while
 *   children silently failed to appear; the parent's own real, un-invented state values are used
 *   (`BLOCKED_TERMINAL` for contentCards, `qualityStatus: "quarantined"` + `visibility: "hidden"` for
 *   providers -- no new enum value invented on either collection).
 */

const MIN_REASON_LENGTH = 5;
const MIN_CHILDREN = 2;

// ---- Ported ID-generation primitives (2026-08-07) ----
// contentCards: contentCards.ts's normalizeText/sourceHostFromUrl/hash/buildContentCardIdentityFromParts.
// providers: classscoutAdapter.ts's slugify + the `id: prov-${slugify(title)}` call site.

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sourceHostFromUrl(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function sha1Hex24(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 24);
}

export function computeContentCardIdentity(parts: {
  title: string;
  sourceUrl: string;
  categoryHint: string;
  boroughGuess: string;
  neighborhoodGuess: string;
  /** Set only when disambiguating a fingerprint collision -- the real formula has no such field for a
   *  manually-split card; this repo's own addition, folded into the hash basis exactly like
   *  `sourceOpportunityId` is in the real formula. */
  disambiguator?: string;
}): { contentCardId: string; fingerprint: string; normalizedTitle: string; sourceHost: string } {
  const normalizedTitle = normalizeText(parts.title);
  const sourceUrl = String(parts.sourceUrl ?? "").trim();
  const sourceHost = sourceHostFromUrl(sourceUrl);
  const basis = [
    normalizedTitle,
    sourceUrl.toLowerCase() || sourceHost,
    parts.categoryHint,
    parts.boroughGuess,
    parts.neighborhoodGuess,
    parts.disambiguator ?? "",
  ]
    .map((part) => normalizeText(part))
    .join("|");
  const fingerprint = sha1Hex24(basis);
  return { contentCardId: `cc-${fingerprint}`, fingerprint, normalizedTitle, sourceHost };
}

export function slugifyProviderName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ---- Request shape ----

export interface SplitChildInput {
  // contentCards
  title?: string;
  sourceUrl?: string;
  categoryHint?: string;
  boroughGuess?: string;
  neighborhoodGuess?: string;
  // providers
  name?: string;
  website?: string;
  category?: string;
  borough?: string;
  neighborhood?: string;
  address?: string;
  activityTypes?: string[];
  shortDescription?: string;
  longDescription?: string;
}

export interface NormalizedSplitRequest {
  collection: "contentCards" | "providers";
  parentId: string;
  children: SplitChildInput[];
  reason: string;
  source: string;
  dryRun: boolean;
}

export type SplitValidationResult =
  | { ok: true; value: NormalizedSplitRequest }
  | { ok: false; status: 400; error: string };

function isHttpsUrl(value: unknown): value is string {
  return typeof value === "string" && value.trim().startsWith("https://") && value.trim().length > 12;
}

/** Pure validation -- no I/O, mirrors validateWriteRequest's shape and error style. */
export function validateSplitRequest(body: unknown): SplitValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (b.collection !== "contentCards" && b.collection !== "providers") {
    return { ok: false, status: 400, error: 'collection must be "contentCards" or "providers" -- splitting is not supported for other collections' };
  }
  const collection = b.collection;

  if (typeof b.parentId !== "string" || !b.parentId.trim()) {
    return { ok: false, status: 400, error: "parentId must be a non-empty string" };
  }

  if (!Array.isArray(b.children) || b.children.length < MIN_CHILDREN) {
    return { ok: false, status: 400, error: `children must be an array of at least ${MIN_CHILDREN} entries -- a "split" into fewer than 2 real records isn't a split` };
  }
  const children = b.children as SplitChildInput[];

  const sourceKey = collection === "contentCards" ? "sourceUrl" : "website";
  const seenSources = new Set<string>();
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i] as Record<string, unknown>;
    const label = `children[${i}]`;

    if (collection === "contentCards") {
      if (typeof child.title !== "string" || !child.title.trim()) return { ok: false, status: 400, error: `${label}.title must be a non-empty string` };
      if (!isHttpsUrl(child.sourceUrl)) return { ok: false, status: 400, error: `${label}.sourceUrl must be a real https:// URL -- every child needs its own genuinely distinguishing source, not a placeholder` };
      if (typeof child.categoryHint !== "string" || !child.categoryHint.trim()) return { ok: false, status: 400, error: `${label}.categoryHint must be a non-empty string` };
      if (typeof child.boroughGuess !== "string" || !child.boroughGuess.trim()) return { ok: false, status: 400, error: `${label}.boroughGuess must be a non-empty string` };
      if (typeof child.neighborhoodGuess !== "string" || !child.neighborhoodGuess.trim()) return { ok: false, status: 400, error: `${label}.neighborhoodGuess must be a non-empty string` };
    } else {
      if (typeof child.name !== "string" || !child.name.trim()) return { ok: false, status: 400, error: `${label}.name must be a non-empty string` };
      if (!isHttpsUrl(child.website)) return { ok: false, status: 400, error: `${label}.website must be a real https:// URL -- every child needs its own genuinely distinguishing source, not a placeholder` };
      if (typeof child.category !== "string" || !(CATEGORY_VALUES as readonly string[]).includes(child.category)) {
        return { ok: false, status: 400, error: `${label}.category must be one of: ${CATEGORY_VALUES.join(", ")}` };
      }
      if (typeof child.borough !== "string" || !child.borough.trim()) return { ok: false, status: 400, error: `${label}.borough must be a non-empty string` };
      if (typeof child.neighborhood !== "string" || !child.neighborhood.trim()) return { ok: false, status: 400, error: `${label}.neighborhood must be a non-empty string` };
      if (child.activityTypes !== undefined) {
        if (!Array.isArray(child.activityTypes) || child.activityTypes.length > 3 || !child.activityTypes.every((a) => typeof a === "string")) {
          return { ok: false, status: 400, error: `${label}.activityTypes must be an array of at most 3 strings` };
        }
      }
      for (const field of ["shortDescription", "longDescription"] as const) {
        const value = child[field];
        if (typeof value === "string") {
          const copyError = validateCopyQuality(value, field);
          if (copyError) return { ok: false, status: 400, error: `${label}.${copyError}` };
        }
      }
    }

    // (2026-08-09) The value-shape guards the UPDATE path had and this one did not. Found by using
    // the split for real: four Tennis Innovators children were inserted with no `primaryActivityType`
    // and an unaligned activity list, and nothing here would have stopped a compound borough or a
    // `no category` hint either. A split is the only path that CREATES a document, so it is the last
    // place that should be the laxest.
    const placeKeys = collection === "contentCards"
      ? (["boroughGuess", "neighborhoodGuess"] as const)
      : (["borough", "neighborhood"] as const);
    for (const key of placeKeys) {
      const err = placeValueError(child[key]);
      if (err) return { ok: false, status: 400, error: `${label}.${key} ${err}` };
    }
    for (const key of collection === "contentCards" ? (["categoryHint"] as const) : (["category", "activityTypes"] as const)) {
      const err = categoryValueError(child[key]);
      if (err) return { ok: false, status: 400, error: `${label}.${key} ${err}` };
    }

    const rawSource = String((child as Record<string, unknown>)[sourceKey]).trim().toLowerCase();
    if (seenSources.has(rawSource)) {
      return { ok: false, status: 400, error: `Two children share the same ${sourceKey} ("${rawSource}") -- each child needs a genuinely distinct source, or this isn't a real split.` };
    }
    seenSources.add(rawSource);
  }

  if (typeof b.reason !== "string" || b.reason.trim().length < MIN_REASON_LENGTH) {
    return { ok: false, status: 400, error: `reason must be a string of at least ${MIN_REASON_LENGTH} characters` };
  }
  if (typeof b.source !== "string" || !b.source.trim()) {
    return { ok: false, status: 400, error: "source must be a non-empty string (who/what is making this change)" };
  }

  const dryRun = b.dryRun !== false;

  return { ok: true, value: { collection, parentId: b.parentId, children, reason: b.reason, source: b.source, dryRun } };
}

export interface SplitOutcome {
  found: boolean;
  dryRun: boolean;
  collection: "contentCards" | "providers";
  parentId: string;
  parentBefore?: Record<string, unknown>;
  parentAfter?: Record<string, unknown>;
  /** The generated child documents -- present in both dry-run (preview) and apply (what was actually
   *  inserted) so the caller can verify IDs before committing either way. */
  children?: Record<string, unknown>[];
  auditId?: string;
}

async function uniqueContentCardIdentity(
  db: ReturnType<typeof getBridgeDb>,
  child: SplitChildInput,
): Promise<ReturnType<typeof computeContentCardIdentity>> {
  const base = {
    title: child.title!,
    sourceUrl: child.sourceUrl!,
    categoryHint: child.categoryHint!,
    boroughGuess: child.boroughGuess!,
    neighborhoodGuess: child.neighborhoodGuess!,
  };
  let identity = computeContentCardIdentity(base);
  let attempt = 0;
  // The real unique index is {fingerprint, kind} -- collision is expected to be rare (children differ
  // by sourceUrl/borough/neighborhood already), but checked and disambiguated rather than assumed.
  while (await db.collection("classscoutContentCards").findOne({ fingerprint: identity.fingerprint, kind: "content" })) {
    attempt += 1;
    if (attempt > 10) throw new Error(`Could not generate a unique contentCardId for "${child.title}" after 10 attempts`);
    identity = computeContentCardIdentity({ ...base, disambiguator: `split-${attempt}` });
  }
  return identity;
}

async function uniqueProviderId(db: ReturnType<typeof getBridgeDb>, name: string): Promise<string> {
  const slug = slugifyProviderName(name);
  let candidate = `prov-${slug}`;
  let attempt = 1;
  // providers.id has NO uniqueness constraint in the database at all (confirmed by reading the schema)
  // -- this check is the only thing standing between a split and silently colliding with an existing id.
  while (await db.collection("providers").findOne({ id: candidate })) {
    attempt += 1;
    if (attempt > 20) throw new Error(`Could not generate a unique provider id for "${name}" after 20 attempts`);
    candidate = `prov-${slug}-${attempt}`;
  }
  return candidate;
}

export async function applyCardBridgeSplit(request: NormalizedSplitRequest): Promise<SplitOutcome> {
  const db = getBridgeDb();
  const mongoCollection = request.collection === "contentCards" ? "classscoutContentCards" : "providers";
  const idField = request.collection === "contentCards" ? "contentCardId" : "id";

  const parent = await db.collection(mongoCollection).findOne({ [idField]: request.parentId });
  if (!parent) {
    return { found: false, dryRun: request.dryRun, collection: request.collection, parentId: request.parentId };
  }

  const nowIso = new Date().toISOString();
  const childDocs: Record<string, unknown>[] = [];

  if (request.collection === "contentCards") {
    for (const child of request.children) {
      const identity = await uniqueContentCardIdentity(db, child);
      childDocs.push({
        contentCardId: identity.contentCardId,
        fingerprint: identity.fingerprint,
        kind: "content",
        state: "DISCOVERED",
        title: child.title,
        normalizedTitle: identity.normalizedTitle,
        sourceHost: identity.sourceHost,
        sourceUrl: child.sourceUrl,
        categoryHint: child.categoryHint,
        boroughGuess: child.boroughGuess,
        neighborhoodGuess: child.neighborhoodGuess,
        entityKindHint: parent.entityKindHint ?? "provider",
        sourcePool: parent.sourcePool ?? "live_discovery",
        sourceAuthorityGrade: "unknown",
        visitorVisibility: "not_visitor_visible_yet",
        operationalVisibility: "active",
        blockerCodes: [],
        incompleteFields: [],
        terminalReason: null,
        nextEligibleRunAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastReviewedAt: nowIso,
        lastReviewedBy: request.source,
        bridgeSplitFromId: request.parentId,
        bridgeSplitAt: nowIso,
        bridgeSplitReason: request.reason,
      });
    }
  } else {
    for (const child of request.children) {
      const id = await uniqueProviderId(db, child.name!);
      // (2026-08-09) The same derivation every `providers` write goes through. Without it a split child
      // arrived with NO `primaryActivityType` at all and an activity list nobody had put through the
      // sport-dominant rule — so the one path that creates records was also the one path that skipped
      // the taxonomy. The child's own name is the title signal, which is exactly what the update path
      // passes when a provider write touches these fields.
      const aligned = alignActivityTypes({
        activityTypes: child.activityTypes ?? [],
        title: child.name,
      });
      childDocs.push({
        id,
        name: child.name,
        category: child.category,
        borough: child.borough,
        neighborhood: child.neighborhood,
        address: child.address,
        activityTypes: aligned.activityTypes,
        primaryActivityType: aligned.primaryActivityType,
        shortDescription: child.shortDescription,
        longDescription: child.longDescription,
        website: child.website,
        sourceUrls: [child.website],
        city: parent.city,
        incompleteFields: [],
        // FORCED regardless of anything the caller passes: a raw insert bypasses the main app's own
        // publish gate/dedup entirely, so a split-off provider can never be created already-live
        // through this bridge -- a human must explicitly un-hide it through the main app itself.
        visibility: "hidden",
        createdAt: nowIso,
        updatedAt: nowIso,
        lastReviewedAt: nowIso,
        lastReviewedBy: request.source,
        bridgeSplitFromId: request.parentId,
        bridgeSplitAt: nowIso,
        bridgeSplitReason: request.reason,
      });
    }
  }

  const parentUpdate =
    request.collection === "contentCards"
      ? {
          state: "BLOCKED_TERMINAL",
          terminalReason: `split_into_children: ${childDocs.map((c) => c.contentCardId).join(", ")}. ${request.reason}`,
        }
      : { qualityStatus: "quarantined", visibility: "hidden" };

  if (request.dryRun) {
    return {
      found: true,
      dryRun: true,
      collection: request.collection,
      parentId: request.parentId,
      parentBefore: Object.fromEntries(Object.keys(parentUpdate).map((k) => [k, parent[k] ?? null])),
      parentAfter: parentUpdate,
      children: childDocs,
    };
  }

  await db.collection(mongoCollection).insertMany(childDocs as never[]);

  const parentBefore = Object.fromEntries(Object.keys(parentUpdate).map((k) => [k, parent[k] ?? null]));
  await db.collection(mongoCollection).updateOne({ [idField]: request.parentId }, { $set: { ...parentUpdate, updatedAt: nowIso, lastReviewedAt: nowIso, lastReviewedBy: request.source } });

  const auditId = randomUUID();
  await db.collection("cardBridgeAuditLog").insertOne({
    auditId,
    action: "split",
    collection: request.collection,
    id: request.parentId,
    childIds: childDocs.map((c) => c[idField]),
    before: parentBefore,
    after: parentUpdate,
    reason: request.reason,
    source: request.source,
    appliedAt: nowIso,
  });

  return {
    found: true,
    dryRun: false,
    collection: request.collection,
    parentId: request.parentId,
    parentBefore,
    parentAfter: parentUpdate,
    children: childDocs,
    auditId,
  };
}
