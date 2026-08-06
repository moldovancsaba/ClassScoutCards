import { describe, expect, it } from "vitest";
import {
  amenityHighlights,
  buildFamilyServicePlaceFact,
  buildFamilyServiceReviewPacket,
  candidateConfidence,
  isPublicStatus,
  normalizeFamilyServiceLead,
  reviewPacketEligible,
  validateFamilyServiceLead,
} from "./core";
import type { FamilyServiceLead } from "./types";

const NOW = "2026-08-06T12:00:00.000Z";

function baseLead(overrides: Partial<FamilyServiceLead> = {}): FamilyServiceLead {
  return {
    leadId: "lead-1",
    schemaVersion: 1,
    sourceSystem: "letsgobaby",
    sourceUrl: "https://letsgobaby.co/location/x",
    sourceSlug: "x",
    visibility: "hidden",
    status: "hidden_ready",
    name: "Test Business",
    serviceKind: "Diner",
    amenities: { highChairs: true },
    tags: ["test"],
    duplicateKey: "dup-1",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateFamilyServiceLead", () => {
  it("returns no blockers for a complete, valid lead", () => {
    expect(validateFamilyServiceLead(baseLead())).toEqual([]);
  });

  it("flags every missing required field independently", () => {
    const blockers = validateFamilyServiceLead(baseLead({ leadId: "", sourceSystem: "", sourceUrl: "", name: "", duplicateKey: "" }));
    expect(blockers).toEqual(
      expect.arrayContaining(["missing_lead_id", "missing_source_system", "missing_source_url", "missing_name", "missing_duplicate_key"]),
    );
  });

  it("flags out-of-range latitude/longitude", () => {
    expect(validateFamilyServiceLead(baseLead({ latitude: 95 }))).toContain("invalid_latitude");
    expect(validateFamilyServiceLead(baseLead({ longitude: -190 }))).toContain("invalid_longitude");
  });

  it("accepts valid boundary latitude/longitude", () => {
    expect(validateFamilyServiceLead(baseLead({ latitude: 90, longitude: -180 }))).toEqual([]);
  });
});

describe("isPublicStatus / normalizeFamilyServiceLead", () => {
  it("only approved_support_only and approved_for_publication are public statuses", () => {
    expect(isPublicStatus("approved_support_only")).toBe(true);
    expect(isPublicStatus("approved_for_publication")).toBe(true);
    expect(isPublicStatus("hidden_ready")).toBe(false);
    expect(isPublicStatus("ready_for_existing_category_review")).toBe(false);
    expect(isPublicStatus("rejected")).toBe(false);
  });

  it("derives visibility from status, never trusts an existing visibility value", () => {
    const inconsistent = baseLead({ status: "approved_support_only", visibility: "hidden" });
    expect(normalizeFamilyServiceLead(inconsistent, NOW).visibility).toBe("public_support");

    const alsoInconsistent = baseLead({ status: "hidden_ready", visibility: "public_support" });
    expect(normalizeFamilyServiceLead(alsoInconsistent, NOW).visibility).toBe("hidden");
  });

  it("recomputes blockers from validateFamilyServiceLead, ignoring any stale stored value", () => {
    const withStaleBlockers = baseLead({ blockers: ["some_old_blocker_no_longer_true"] });
    expect(normalizeFamilyServiceLead(withStaleBlockers, NOW).blockers).toEqual([]);
  });

  it("dedupes and trims tags, caps at 40", () => {
    const messy = baseLead({ tags: [" a ", "a", "b", ...Array.from({ length: 50 }, (_, i) => `tag${i}`)] });
    const normalized = normalizeFamilyServiceLead(messy, NOW);
    expect(normalized.tags.filter((t) => t === "a")).toHaveLength(1);
    expect(normalized.tags.length).toBeLessThanOrEqual(40);
  });

  it("stamps updatedAt to the provided now", () => {
    expect(normalizeFamilyServiceLead(baseLead(), NOW).updatedAt).toBe(NOW);
  });
});

describe("amenityHighlights / candidateConfidence", () => {
  it("lists only true amenities, using the real display labels, capped at limit", () => {
    const lead = baseLead({ amenities: { highChairs: true, strollerStorage: true, reservations: false } });
    expect(amenityHighlights(lead)).toEqual(["High chairs", "Stroller storage"]);
  });

  it("confidence increases with each real evidence signal and stays within [0,1000]", () => {
    const minimal = baseLead({ sourceUrl: "", amenities: {} });
    const rich = baseLead({
      latitude: 40.7,
      longitude: -74,
      address: "123 Main St",
      existingClassScoutCategoryCandidate: "Classes",
      sourceEvidence: { pageKind: "list", hasParentTip: true, sourceClaimsNeedVerification: false },
    });
    const minimalScore = candidateConfidence(minimal);
    const richScore = candidateConfidence(rich);
    expect(richScore).toBeGreaterThan(minimalScore);
    expect(richScore).toBeLessThanOrEqual(1000);
    expect(minimalScore).toBeGreaterThanOrEqual(0);
  });
});

describe("buildFamilyServicePlaceFact", () => {
  it("derives geo with exact accuracy when both coords and an address are present", () => {
    const lead = baseLead({ latitude: 40.7, longitude: -74, address: "123 Main St" });
    const fact = buildFamilyServicePlaceFact(lead, NOW);
    expect(fact.geo).toEqual({ lat: 40.7, lng: -74, accuracy: "exact" });
  });

  it("derives geo with approximate accuracy when coords exist but address doesn't", () => {
    const lead = baseLead({ latitude: 40.7, longitude: -74, address: undefined });
    const fact = buildFamilyServicePlaceFact(lead, NOW);
    expect(fact.geo?.accuracy).toBe("approximate");
  });

  it("omits geo entirely when coordinates are missing", () => {
    const fact = buildFamilyServicePlaceFact(baseLead(), NOW);
    expect(fact.geo).toBeUndefined();
  });

  it("factId is deterministic from leadId", () => {
    expect(buildFamilyServicePlaceFact(baseLead({ leadId: "abc" }), NOW).factId).toBe("service-fact-abc");
  });

  it("reviewStatus mirrors the lead's status, visibility mirrors the derived (not stored) value", () => {
    const lead = baseLead({ status: "approved_support_only", visibility: "hidden" });
    const fact = buildFamilyServicePlaceFact(lead, NOW);
    expect(fact.reviewStatus).toBe("approved_support_only");
    expect(fact.visibility).toBe("public_support");
  });
});

describe("reviewPacketEligible / buildFamilyServiceReviewPacket", () => {
  it("only ready_for_existing_category_review and needs_official_confirmation are eligible", () => {
    expect(reviewPacketEligible("ready_for_existing_category_review")).toBe(true);
    expect(reviewPacketEligible("needs_official_confirmation")).toBe(true);
    expect(reviewPacketEligible("hidden_ready")).toBe(false);
    expect(reviewPacketEligible("approved_support_only")).toBe(false);
  });

  it("a lead with blockers only allows needs_confirmation/reject/merge_duplicate", () => {
    const packet = buildFamilyServiceReviewPacket(baseLead({ leadId: "" }), NOW);
    expect(packet.allowedActions).toEqual(["needs_confirmation", "reject", "merge_duplicate"]);
  });

  it("a clean lead with a category candidate allows the full action set", () => {
    const packet = buildFamilyServiceReviewPacket(baseLead({ existingClassScoutCategoryCandidate: "Classes" }), NOW);
    expect(packet.allowedActions).toContain("approve_public_category");
    expect(packet.candidateCategories).toEqual(["Classes"]);
  });

  it("a clean lead with no category candidate never offers approve_public_category", () => {
    const packet = buildFamilyServiceReviewPacket(baseLead(), NOW);
    expect(packet.allowedActions).not.toContain("approve_public_category");
    expect(packet.allowedActions).toContain("approve_support_only");
  });
});
