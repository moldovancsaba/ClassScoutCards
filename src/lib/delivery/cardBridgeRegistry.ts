/**
 * SSOT registry for every collection the card-bridge can read from / write to. Adding a new
 * collection or field means editing this file — the read/write routes never accept an arbitrary
 * collection name or field key that isn't listed here.
 *
 * Field names are ported from the main classscout app's real schema (src/types/provider.ts,
 * src/types/meetup.ts, src/lib/contentIntelligence/contentCards.ts as of 2026-08-06) — kept in sync
 * by hand since this is a separate repo/deployment.
 */

export type BridgeCollectionKey = "contentCards" | "providers" | "meetupGroups";

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
      updatedAt: 1,
      createdAt: 1,
    },
    writableFields: ["categoryHint", "boroughGuess", "neighborhoodGuess", "blockerCodes", "enrichmentStatus", "incompleteFields"],
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
      updatedAt: 1,
    },
    writableFields: ["groupType", "description", "coverImageUrl", "ageRange", "cadence"],
    copyFields: ["description"],
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
