/**
 * Ported subset of the main classscout app's family-services core logic
 * (src/lib/familyServices/core.ts there, as of 2026-08-06). Pure functions only — the exact
 * normalization/validation/derivation rules, so a write made through this bridge produces the same
 * shape the main app's own pipeline would have produced. Ported, not imported — separate
 * repo/deployment. Keep in sync by hand if the source changes.
 */
import {
  FAMILY_SERVICE_AMENITY_LABELS,
  FAMILY_SERVICE_PUBLIC_STATUSES,
  FAMILY_SERVICE_SCHEMA_VERSION,
  type FamilyServiceLead,
  type FamilyServicePlaceFact,
  type FamilyServiceReviewPacket,
} from "@/lib/familyServices/types";

export function isPublicStatus(status: FamilyServiceLead["status"]): boolean {
  return FAMILY_SERVICE_PUBLIC_STATUSES.includes(status);
}

export function validateFamilyServiceLead(
  lead: Pick<FamilyServiceLead, "leadId" | "sourceSystem" | "sourceUrl" | "name" | "duplicateKey" | "latitude" | "longitude">,
): string[] {
  const blockers: string[] = [];
  if (!lead.leadId) blockers.push("missing_lead_id");
  if (!lead.sourceSystem) blockers.push("missing_source_system");
  if (!lead.sourceUrl) blockers.push("missing_source_url");
  if (!lead.name?.trim()) blockers.push("missing_name");
  if (!lead.duplicateKey) blockers.push("missing_duplicate_key");
  if (lead.latitude !== undefined && (lead.latitude < -90 || lead.latitude > 90)) blockers.push("invalid_latitude");
  if (lead.longitude !== undefined && (lead.longitude < -180 || lead.longitude > 180)) blockers.push("invalid_longitude");
  return blockers;
}

/** Recomputes visibility from status and blockers from validateFamilyServiceLead — the two fields a
 *  caller must NEVER set directly, so a write through this bridge can't produce an inconsistent
 *  status/visibility pair or a stale blockers list. Mirrors normalizeFamilyServiceLead exactly. */
export function normalizeFamilyServiceLead(lead: FamilyServiceLead, now: string): FamilyServiceLead {
  return {
    ...lead,
    schemaVersion: lead.schemaVersion || FAMILY_SERVICE_SCHEMA_VERSION,
    visibility: isPublicStatus(lead.status) ? "public_support" : "hidden",
    tags: Array.from(new Set((lead.tags || []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 40),
    blockers: validateFamilyServiceLead(lead),
    updatedAt: now,
  };
}

export function amenityHighlights(lead: Pick<FamilyServiceLead, "amenities">, limit = 4): string[] {
  return Object.entries(lead.amenities || {})
    .filter(([, value]) => value === true)
    .map(([key]) => FAMILY_SERVICE_AMENITY_LABELS[key as keyof typeof FAMILY_SERVICE_AMENITY_LABELS])
    .filter(Boolean)
    .slice(0, limit);
}

export function candidateConfidence(lead: FamilyServiceLead): number {
  let score = 350;
  if (lead.sourceUrl) score += 100;
  if (lead.latitude !== undefined && lead.longitude !== undefined) score += 150;
  if (lead.address) score += 100;
  if (amenityHighlights(lead).length) score += 100;
  if (lead.existingClassScoutCategoryCandidate) score += 150;
  if (lead.sourceEvidence?.hasParentTip) score += 50;
  return Math.max(0, Math.min(1000, score));
}

export function buildFamilyServicePlaceFact(lead: FamilyServiceLead, now: string): FamilyServicePlaceFact {
  const normalized = normalizeFamilyServiceLead(lead, now);
  const hasGeo = typeof normalized.latitude === "number" && typeof normalized.longitude === "number";
  return {
    factId: `service-fact-${normalized.leadId}`,
    leadId: normalized.leadId,
    schemaVersion: normalized.schemaVersion || FAMILY_SERVICE_SCHEMA_VERSION,
    sourceSystem: normalized.sourceSystem,
    sourceUrl: normalized.sourceUrl,
    visibility: normalized.visibility,
    reviewStatus: normalized.status,
    name: normalized.name,
    serviceKind: normalized.serviceKind,
    priceTier: normalized.priceTier,
    neighborhood: normalized.neighborhood,
    borough: normalized.borough,
    address: normalized.address,
    geo: hasGeo
      ? { lat: normalized.latitude as number, lng: normalized.longitude as number, accuracy: normalized.address ? "exact" : "approximate" }
      : undefined,
    amenities: normalized.amenities,
    tags: normalized.tags,
    existingClassScoutCategoryCandidate: normalized.existingClassScoutCategoryCandidate,
    existingCategoryReason: normalized.existingCategoryReason,
    evidence: normalized.evidence?.length ? normalized.evidence : normalized.sourceEvidence ? [normalized.sourceEvidence] : [],
    confidenceScore: normalized.confidenceScore ?? candidateConfidence(normalized),
    duplicateKey: normalized.duplicateKey,
    blockers: normalized.blockers ?? validateFamilyServiceLead(normalized),
    updatedAt: now,
  };
}

/** Only leads at these two statuses get a review packet (mirrors upsertFamilyServiceReviewPackets'
 *  own filter) — everything else should not have an open packet. */
export function reviewPacketEligible(status: FamilyServiceLead["status"]): boolean {
  return status === "ready_for_existing_category_review" || status === "needs_official_confirmation";
}

export function buildFamilyServiceReviewPacket(lead: FamilyServiceLead, now: string): FamilyServiceReviewPacket {
  const blockers = lead.blockers?.length ? lead.blockers : validateFamilyServiceLead(lead);
  const candidateCategories = lead.existingClassScoutCategoryCandidate ? [lead.existingClassScoutCategoryCandidate] : [];
  const allowedActions = blockers.length
    ? (["needs_confirmation", "reject", "merge_duplicate"] as const)
    : lead.existingClassScoutCategoryCandidate
      ? (["approve_public_category", "approve_support_only", "needs_confirmation", "reject", "merge_duplicate"] as const)
      : (["approve_support_only", "needs_confirmation", "reject", "merge_duplicate"] as const);
  return {
    packetId: `service-review-${lead.leadId}`,
    leadId: lead.leadId,
    status: "open",
    facts: lead,
    allowedActions: [...allowedActions],
    candidateCategories,
    confidenceScore: lead.confidenceScore ?? candidateConfidence(lead),
    blockers,
    reasons: [lead.existingCategoryReason, ...amenityHighlights(lead).map((label) => `Amenity evidence: ${label}`)].filter(
      (x): x is string => Boolean(x),
    ),
    createdAt: now,
    updatedAt: now,
  };
}
