/**
 * Ported subset of the main classscout app's family-services domain types
 * (src/lib/familyServices/types.ts there, as of 2026-08-06). Ported, not imported — separate
 * repo/deployment. Keep in sync by hand if the source changes.
 */

export const FAMILY_SERVICE_SCHEMA_VERSION = 1;

export type FamilyServiceVisibility = "hidden" | "public_support";

export const FAMILY_SERVICE_LEAD_STATUSES = [
  "hidden_ready",
  "ready_for_existing_category_review",
  "needs_official_confirmation",
  "approved_support_only",
  "approved_public_category",
  "approved_for_publication",
  "rejected",
  "merged_duplicate",
] as const;
export type FamilyServiceLeadStatus = (typeof FAMILY_SERVICE_LEAD_STATUSES)[number];

/** Statuses that flip visibility to "public_support" — i.e. make the lead show up in
 *  publicFamilyServiceFilter/publicFamilyServiceFactFilter reads. The family-service equivalent of
 *  publishing. Never set one of these when the lead carries any unresolved blocker. */
export const FAMILY_SERVICE_PUBLIC_STATUSES: readonly FamilyServiceLeadStatus[] = [
  "approved_support_only",
  "approved_for_publication",
];

export type FamilyServicePriceTier = "$" | "$$" | "$$$" | "$$$$";

export interface FamilyServiceAmenities {
  highChairs?: boolean;
  boosterSeats?: boolean;
  changingTable?: boolean;
  menuModifications?: boolean;
  strollerStorage?: boolean;
  kidsOptions?: boolean;
  outdoorSeating?: boolean;
  reservations?: boolean;
}

export interface FamilyServiceSourceEvidence {
  pageKind: "map" | "list" | "community_submission" | "manual_review";
  sourceUrl?: string;
  hasParentTip?: boolean;
  sourceClaimsNeedVerification: boolean;
  extractedAt?: string;
}

export interface FamilyServiceLead {
  leadId: string;
  schemaVersion: number;
  sourceSystem: string;
  sourceUrl: string;
  sourceSlug: string;
  visibility: FamilyServiceVisibility;
  status: FamilyServiceLeadStatus;
  name: string;
  serviceKind: string;
  priceTier?: FamilyServicePriceTier;
  neighborhood?: string;
  borough?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  amenities: FamilyServiceAmenities;
  tags: string[];
  existingClassScoutCategoryCandidate?: string;
  existingCategoryReason?: string;
  sourceEvidence?: FamilyServiceSourceEvidence;
  evidence?: FamilyServiceSourceEvidence[];
  confidenceScore?: number;
  blockers?: string[];
  duplicateKey: string;
  updatedAt: string;
  createdAt?: string;
}

export type FamilyServiceGeoAccuracy = "exact" | "approximate" | "missing";

export interface FamilyServicePlaceFact {
  factId: string;
  leadId: string;
  schemaVersion: number;
  sourceSystem: string;
  sourceUrl: string;
  visibility: FamilyServiceVisibility;
  reviewStatus: FamilyServiceLeadStatus;
  name: string;
  serviceKind: string;
  priceTier?: FamilyServicePriceTier;
  neighborhood?: string;
  borough?: string;
  address?: string;
  geo?: { lat: number; lng: number; accuracy: FamilyServiceGeoAccuracy };
  amenities: FamilyServiceAmenities;
  tags: string[];
  existingClassScoutCategoryCandidate?: string;
  existingCategoryReason?: string;
  evidence: FamilyServiceSourceEvidence[];
  confidenceScore: number;
  duplicateKey: string;
  blockers: string[];
  updatedAt: string;
}

export type FamilyServiceReviewAction =
  | "approve_public_category"
  | "approve_support_only"
  | "needs_confirmation"
  | "reject"
  | "merge_duplicate";

export interface FamilyServiceReviewPacket {
  packetId: string;
  leadId: string;
  status: "open" | "resolved";
  facts: FamilyServiceLead;
  allowedActions: FamilyServiceReviewAction[];
  candidateCategories: string[];
  confidenceScore: number;
  blockers: string[];
  reasons: string[];
  createdAt: string;
  updatedAt: string;
}

export const FAMILY_SERVICE_AMENITY_LABELS: Record<keyof FamilyServiceAmenities, string> = {
  highChairs: "High chairs",
  boosterSeats: "Booster seats",
  changingTable: "Changing table",
  menuModifications: "Menu modifications",
  strollerStorage: "Stroller storage",
  kidsOptions: "Kids options",
  outdoorSeating: "Outdoor seating",
  reservations: "Reservations",
};
