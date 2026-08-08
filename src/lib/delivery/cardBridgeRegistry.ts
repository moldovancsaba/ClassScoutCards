/**
 * SSOT registry for every collection the card-bridge can read from / write to. Adding a new
 * collection or field means editing this file — the read/write routes never accept an arbitrary
 * collection name or field key that isn't listed here.
 *
 * Field names are ported from the main classscout app's real schema (src/types/provider.ts,
 * src/types/meetup.ts, src/lib/contentIntelligence/contentCards.ts as of 2026-08-06) — kept in sync
 * by hand since this is a separate repo/deployment.
 */

import { ALLOWED_STATES, type ContentCardState } from "@/lib/delivery/contentCardsBridge";

export type BridgeCollectionKey =
  | "contentCards"
  | "providers"
  | "meetupGroups"
  | "serviceLeads"
  | "servicePlaceFacts"
  | "serviceReviewPackets"
  | "serviceTasks";

export { ALLOWED_STATES, type ContentCardState };

/**
 * A content-card state this bridge is allowed to SET via a write. Deliberately excludes "PUBLISHED" —
 * publishing a card requires the main app's full gate (dedupe, schema validation, image pipeline,
 * safe-publish flags), none of which this bridge replicates. A write attempting state="PUBLISHED" is
 * rejected explicitly in cardBridgeWrite.ts with a message saying so, rather than silently no-op'd.
 */
export const BRIDGE_SETTABLE_STATES = ALLOWED_STATES.filter((s) => s !== "PUBLISHED");

/** Every writable collection gets these two review-provenance fields, stamped automatically by
 *  cardBridgeWrite.ts on every applied (non-dry-run) write, INCLUDING a pure touch (no content change)
 *  — this is what lets "reviewed, decided no change needed" be distinguished from "never reviewed". */
const REVIEW_PROVENANCE_FIELDS = ["lastReviewedAt", "lastReviewedBy"] as const;

export interface BridgeCollectionConfig {
  /** Real Mongo collection name in the shared classscoutcluster database. */
  mongoCollection: string;
  /** The document's own id field (never Mongo's _id). */
  idField: string;
  /** Fixed, non-sensitive projection for reads. */
  readProjection: Record<string, 0 | 1>;
  /** The only fields a write may touch. Anything else in a write request is rejected. */
  writableFields: readonly string[];
  /** Fields that must be valid public copy (validateCopyQuality) when present in a write. */
  copyFields: readonly string[];
}

export const CATEGORY_VALUES = ["Classes", "Camps", "Birthday Parties", "Drop-In Activities"] as const;
export type CategoryValue = (typeof CATEGORY_VALUES)[number];

export const BRIDGE_REGISTRY: Record<BridgeCollectionKey, BridgeCollectionConfig> = {
  contentCards: {
    mongoCollection: "classscoutContentCards",
    idField: "contentCardId",
    readProjection: {
      _id: 0,
      contentCardId: 1,
      kind: 1,
      state: 1,
      title: 1,
      normalizedTitle: 1,
      fingerprint: 1,
      latestRunId: 1,
      sourceAuthorityGrade: 1,
      sourcePool: 1,
      sourceHost: 1,
      sourceUrl: 1,
      categoryHint: 1,
      boroughGuess: 1,
      neighborhoodGuess: 1,
      entityKindHint: 1,
      visitorVisibility: 1,
      operationalVisibility: 1,
      enrichmentStatus: 1,
      enrichmentSummary: 1,
      enrichmentAttemptCount: 1,
      sourceAvailability: 1,
      incompleteFields: 1,
      blockerCodes: 1,
      nextEligibleRunAt: 1,
      terminalReason: 1,
      lastReviewedAt: 1,
      lastReviewedBy: 1,
      updatedAt: 1,
      createdAt: 1,
    },
    writableFields: [
      // (2026-08-07 finding) a contentCard's own title can be a generic extraction artifact -- e.g. a
      // record titled just "Camps" when the real org (per its own extracted facts) is "Manhattan
      // Youth" -- mirroring the same providers.name / prov-camp finding, just on this collection.
      "title",
      "state",
      "categoryHint",
      "boroughGuess",
      "neighborhoodGuess",
      "blockerCodes",
      "terminalReason",
      "enrichmentStatus",
      "incompleteFields",
      // (2026-08-08) Re-sourcing. Across batches 40-45 of the review loop, the single most common
      // finding this bridge could NOT act on was "real entity, wrong source": a card correctly naming a
      // real business but pointing at a third-party directory listing (activityhero.com/biz/...), at a
      // multi-location franchise's bare root domain instead of the branch's own page, or at a different
      // real company that merely shares a word with it (camp.com serving the CAMP retailer on a card
      // about Camp Kidville). Every one of those was written down as prose in `terminalReason` and left
      // unfixed, because sourceUrl was not writable. Making it writable turns those recorded notes into
      // applyable fixes.
      //
      // `sourceHost` is deliberately NOT writable alongside it: it is DERIVED from sourceUrl in
      // applyCardBridgeWrite. Letting a caller set both invites exactly the drift that would break the
      // per-domain sweep (`filter={"sourceHost":...}`), which is now the loop's primary way of finding
      // duplicate clusters -- a card whose host disagreed with its URL would simply vanish from its own
      // cluster.
      "sourceUrl",
      ...REVIEW_PROVENANCE_FIELDS,
    ],
    copyFields: [],
  },
  providers: {
    mongoCollection: "providers",
    idField: "id",
    readProjection: {
      _id: 0,
      id: 1,
      name: 1,
      category: 1,
      categoryConfidence: 1,
      activityTypes: 1,
      programType: 1,
      borough: 1,
      neighborhood: 1,
      shortDescription: 1,
      longDescription: 1,
      image: 1,
      recurringPrograms: 1,
      ageRanges: 1,
      incompleteFields: 1,
      discoveryTier: 1,
      qualityStatus: 1,
      visibility: 1,
      lastReviewedAt: 1,
      lastReviewedBy: 1,
      updatedAt: 1,
      publishedAt: 1,
      // Research fields (2026-08-07 finding, same class of gap as meetupGroups.website): the real
      // Provider type has address/website/phone/email/sourceUrls, but none were exposed here, forcing a
      // review to guess an org's identity from garbage scraped copy instead of going straight to its own
      // source/contact info. address/phone/activityTypes are now also writable (see below), and so are
      // email (placeholder values) and website (dead/wrong domains, see below); sourceUrls stays
      // read-only — it is the discovery pipeline's own provenance trail, not a field to curate.
      address: 1,
      website: 1,
      phone: 1,
      email: 1,
      sourceUrls: 1,
      // Read-only (2026-08-07 finding): a provider can belong to a non-NYC city tenant (issue 472 —
      // absent means the "nyc" default) with its own region/neighborhood vocabulary entirely distinct
      // from NYC boroughs (e.g. LA's "Central LA"/"Harbor" instead of "Manhattan"/"Brooklyn") — without
      // seeing this field, a non-NYC borough value looks like a data-quality bug when it may not be one.
      city: 1,
      // Structured address + geo (2026-08-07, owner directive: a corrected address must be "properly
      // accessible for maps" — zip/geo/neighbourhood/borough/city all confirmed, not just a nicer street
      // line). Real Provider fields (src/types/provider.ts in the main app): geo carries lat/lng/
      // precision/source/geocodedAt; addressComponents is the structured postal breakdown; addressNormalized
      // is the canonical single-line form; addressConfidence records how sure we are of the pin placement.
      // This bridge is not a geocoder — see cardBridgeWrite.ts for the honesty rule on what source/
      // precision values this bridge is allowed to claim.
      geo: 1,
      addressComponents: 1,
      addressNormalized: 1,
      addressConfidence: 1,
      // primaryActivityType (2026-08-07, owner directive): which of this listing's OWN activityTypes is
      // the real headline activity — the main app's own category-banner picker and Activities display
      // already consume this to lead with the right activity instead of raw array order. This is the
      // real mechanism for "indicate the main category," not a truncated activityTypes array.
      primaryActivityType: 1,
      primaryActivityTypeConfidence: 1,
    },
    // qualityStatus/visibility are the DEFENSIVE direction only — this bridge can quarantine/hide an
    // already-published record found to be bad on re-review, but (unlike serviceLeads' public-status
    // safeguard, which gates the RISKY direction) there is no un-quarantine path here: reversing a
    // quarantine is a bigger call than one automated check should make alone. See cardBridgeWrite.ts
    // for the exact allowed values (visibility can only be set to "hidden", qualityStatus only to
    // "quarantined" — the ONLY two real values either field takes per the main app's Provider type).
    writableFields: [
      // (2026-08-07 finding) a provider's own name can itself be a scrape/extraction defect -- e.g. a
      // record literally named "Camp" when the real org is "Camp Orot" -- and there was previously no
      // way to correct it through this bridge at all, only its description/address/etc.
      "name",
      "category",
      "categoryConfidence",
      "programType",
      "address",
      "borough",
      "neighborhood",
      "phone",
      // (2026-08-07 finding) phone/email can carry an obvious template/webbuilder placeholder value
      // (e.g. "555-555-5555", "mymail@mailservice.com") rather than real scraped data -- phone was
      // already writable to fix this; email was not, blocking the same fix for the sibling field.
      "email",
      // (2026-08-08 finding) `website` is the link a family actually clicks, and it can be flatly dead
      // while every other field on the record is correct. Barking Cat Studio is a real, currently
      // operating art studio at 219 Greenwood Ave -- its record's website was `barkingcatstudio.com`,
      // which serves a parked "Coming Soon / under construction" page, while the business itself is at
      // `barkingcatstudio.net`. Same defect class that made `sourceUrl` writable on contentCards (real
      // entity, wrong/dead domain), on the collection where it is a public-facing link rather than an
      // internal provenance note -- so a family clicking through from a live card lands on nothing.
      // Note this is the ENTITY's own link: judge it by whether it reaches the business, and never
      // rewrite it to a directory listing or an aggregator page standing in for the operator's own site.
      "website",
      "activityTypes",
      "primaryActivityType",
      "primaryActivityTypeConfidence",
      "geo",
      "addressComponents",
      "addressNormalized",
      "addressConfidence",
      "shortDescription",
      "longDescription",
      "image",
      "recurringPrograms",
      "ageRanges",
      "incompleteFields",
      "discoveryTier",
      "qualityStatus",
      "visibility",
      ...REVIEW_PROVENANCE_FIELDS,
    ],
    copyFields: ["shortDescription", "longDescription"],
  },
  meetupGroups: {
    mongoCollection: "meetupGroups",
    idField: "id",
    readProjection: {
      _id: 0,
      id: 1,
      name: 1,
      groupType: 1,
      borough: 1,
      neighborhood: 1,
      description: 1,
      coverImageUrl: 1,
      ageRange: 1,
      cadence: 1,
      // website/instagram are read-only here (not in writableFields) — MeetupGroup has no sourceUrl
      // field at all (src/types/meetup.ts in the main app), so website is the closest real analog for
      // step 3's "fetch the card's own source fresh" and was previously invisible to this bridge,
      // forcing research to rely on guessing the org from garbage description text (2026-08-07 finding).
      website: 1,
      instagram: 1,
      qualityStatus: 1,
      visibility: 1,
      lastReviewedAt: 1,
      lastReviewedBy: 1,
      updatedAt: 1,
    },
    // qualityStatus/visibility mirror the providers entry above (added to MeetupGroup itself in the main
    // app 2026-08-07, business-rules.md rule 81) — same DEFENSIVE-only direction, same one-directional
    // allowed values enforced in cardBridgeWrite.ts (visibility only "hidden", qualityStatus only
    // "quarantined"), no un-quarantine path through this bridge.
    writableFields: [
      "groupType",
      "description",
      "coverImageUrl",
      "ageRange",
      "cadence",
      "qualityStatus",
      "visibility",
      ...REVIEW_PROVENANCE_FIELDS,
    ],
    copyFields: ["description"],
  },
  // The four below back the family-services pipeline: lead -> place fact -> review packet, driven by
  // the classscoutLiteFamilyServiceTasks queue in the main app (see src/lib/familyServices/{types,core}.ts
  // there, PORTED — not imported — into src/lib/familyServices/ in THIS repo). serviceLeads is writable:
  // every write is passed through the ported normalizeFamilyServiceLead so visibility/blockers are
  // ALWAYS re-derived from status, never trusted from the caller (see cardBridgeWrite.ts), and every
  // applied lead write cascades into an upserted servicePlaceFacts row and, when eligible, a
  // serviceReviewPackets row — mirroring upsertFamilyServicePlaceFacts/upsertFamilyServiceReviewPackets
  // exactly. servicePlaceFacts/serviceReviewPackets stay NOT directly writable via the API (writableFields
  // []) because they are PURELY DERIVED from a lead in the real architecture — writing them independently
  // would let them drift out of sync with their lead, which the main app's design never allows.
  serviceLeads: {
    mongoCollection: "classscoutServiceLeads",
    idField: "leadId",
    readProjection: {
      _id: 0,
      leadId: 1,
      sourceSystem: 1,
      sourceUrl: 1,
      sourceSlug: 1,
      visibility: 1,
      status: 1,
      name: 1,
      serviceKind: 1,
      priceTier: 1,
      neighborhood: 1,
      borough: 1,
      address: 1,
      latitude: 1,
      longitude: 1,
      amenities: 1,
      tags: 1,
      existingClassScoutCategoryCandidate: 1,
      existingCategoryReason: 1,
      confidenceScore: 1,
      blockers: 1,
      duplicateKey: 1,
      lastReviewedAt: 1,
      lastReviewedBy: 1,
      updatedAt: 1,
      createdAt: 1,
    },
    // Deliberately NOT here: "visibility" (always derived from status) and "blockers" (always
    // re-derived from validateFamilyServiceLead) — see cardBridgeWrite.ts's serviceLeads special case.
    writableFields: [
      "status",
      "name",
      "serviceKind",
      "priceTier",
      "neighborhood",
      "borough",
      "address",
      "latitude",
      "longitude",
      "amenities",
      "tags",
      "existingClassScoutCategoryCandidate",
      "existingCategoryReason",
      ...REVIEW_PROVENANCE_FIELDS,
    ],
    copyFields: [],
  },
  servicePlaceFacts: {
    mongoCollection: "classscoutServicePlaceFacts",
    idField: "factId",
    readProjection: {
      _id: 0,
      factId: 1,
      leadId: 1,
      visibility: 1,
      reviewStatus: 1,
      name: 1,
      serviceKind: 1,
      neighborhood: 1,
      borough: 1,
      address: 1,
      geo: 1,
      amenities: 1,
      tags: 1,
      confidenceScore: 1,
      blockers: 1,
      updatedAt: 1,
    },
    writableFields: [],
    copyFields: [],
  },
  serviceReviewPackets: {
    mongoCollection: "classscoutServiceReviewPackets",
    idField: "packetId",
    readProjection: {
      _id: 0,
      packetId: 1,
      leadId: 1,
      status: 1,
      allowedActions: 1,
      candidateCategories: 1,
      confidenceScore: 1,
      blockers: 1,
      reasons: 1,
      createdAt: 1,
      updatedAt: 1,
    },
    writableFields: [],
    copyFields: [],
  },
  serviceTasks: {
    mongoCollection: "classscoutLiteFamilyServiceTasks",
    idField: "taskId",
    readProjection: {
      _id: 0,
      taskId: 1,
      taskType: 1,
      subjectId: 1,
      status: 1,
      retryCount: 1,
      nextRunAt: 1,
      errorCode: 1,
      errorMessage: 1,
      createdAt: 1,
      updatedAt: 1,
    },
    writableFields: [],
    copyFields: [],
  },
};

export function isBridgeCollectionKey(value: unknown): value is BridgeCollectionKey {
  return typeof value === "string" && value in BRIDGE_REGISTRY;
}

/** Keys in `updates` that are NOT in the collection's writable allow-list. */
export function rejectedFields(collection: BridgeCollectionKey, updates: Record<string, unknown>): string[] {
  const allowed = new Set(BRIDGE_REGISTRY[collection].writableFields);
  return Object.keys(updates).filter((key) => !allowed.has(key));
}
