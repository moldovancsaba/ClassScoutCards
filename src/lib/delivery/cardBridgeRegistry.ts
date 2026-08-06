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
      "state",
      "categoryHint",
      "boroughGuess",
      "neighborhoodGuess",
      "blockerCodes",
      "terminalReason",
      "enrichmentStatus",
      "incompleteFields",
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
      lastReviewedAt: 1,
      lastReviewedBy: 1,
      updatedAt: 1,
      publishedAt: 1,
    },
    writableFields: [
      "category",
      "categoryConfidence",
      "shortDescription",
      "longDescription",
      "image",
      "recurringPrograms",
      "ageRanges",
      "incompleteFields",
      "discoveryTier",
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
      lastReviewedAt: 1,
      lastReviewedBy: 1,
      updatedAt: 1,
    },
    writableFields: ["groupType", "description", "coverImageUrl", "ageRange", "cadence", ...REVIEW_PROVENANCE_FIELDS],
    copyFields: ["description"],
  },
  // The three below back the family-services pipeline (src/lib/familyServices/{types,core}.ts in the
  // main app: lead -> place fact -> review packet, driven by the classscoutLiteFamilyServiceTasks
  // queue). READ-ONLY for now — this state machine has real business-logic invariants
  // (visibility/status transitions, confidence scoring) this bridge doesn't yet replicate, so writing
  // into it blind would risk corrupting review state. Added to investigate the family-service
  // content-card hand-off gap; extend with real writes only once that logic is understood well enough
  // to reproduce safely (see the recommendation this generated).
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
      amenities: 1,
      tags: 1,
      existingClassScoutCategoryCandidate: 1,
      confidenceScore: 1,
      blockers: 1,
      duplicateKey: 1,
      updatedAt: 1,
      createdAt: 1,
    },
    writableFields: [],
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
