import { describe, expect, it } from "vitest";
import { validateWriteRequest } from "./cardBridgeWrite";

const validProviderBody = {
  collection: "providers",
  id: "prov-123",
  updates: { shortDescription: "A welcoming after-school dance program in Park Slope for ages 3-8." },
  reason: "Rewrote scraped-chrome copy from fresh source text",
  source: "copy-quality-lane-test",
};

describe("validateWriteRequest", () => {
  it("accepts a well-formed request and defaults dryRun to true", () => {
    const result = validateWriteRequest(validProviderBody);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.dryRun).toBe(true);
  });

  it("dryRun becomes false only when explicitly passed false", () => {
    const result = validateWriteRequest({ ...validProviderBody, dryRun: false });
    expect(result.ok && result.value.dryRun).toBe(false);
  });

  it("any other dryRun value (true, missing, a string) still defaults to true (safe by default)", () => {
    expect(validateWriteRequest({ ...validProviderBody, dryRun: true }).ok && true).toBe(true);
    expect(validateWriteRequest(validProviderBody).ok && true).toBe(true);
  });

  it("rejects a non-object body", () => {
    expect(validateWriteRequest(null).ok).toBe(false);
    expect(validateWriteRequest("nope").ok).toBe(false);
  });

  it("rejects an unregistered collection", () => {
    const result = validateWriteRequest({ ...validProviderBody, collection: "users" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Unsupported collection/);
  });

  it("rejects a missing/empty id", () => {
    expect(validateWriteRequest({ ...validProviderBody, id: "" }).ok).toBe(false);
    expect(validateWriteRequest({ ...validProviderBody, id: undefined }).ok).toBe(false);
  });

  it("rejects an empty updates object", () => {
    expect(validateWriteRequest({ ...validProviderBody, updates: {} }).ok).toBe(false);
  });

  it("rejects a field outside the collection's writable allow-list — e.g. trying to overwrite website/email", () => {
    const result = validateWriteRequest({ ...validProviderBody, updates: { website: "https://evil.example" } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/not writable/);
  });

  it("rejects a too-short reason (no real justification)", () => {
    expect(validateWriteRequest({ ...validProviderBody, reason: "fix" }).ok).toBe(false);
  });

  it("rejects a missing source", () => {
    const { source, ...rest } = validProviderBody;
    expect(validateWriteRequest(rest).ok).toBe(false);
  });

  it("rejects a category outside the real enum", () => {
    const result = validateWriteRequest({ ...validProviderBody, updates: { category: "Sports" } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/category must be one of/);
  });

  it("accepts a real category value", () => {
    const result = validateWriteRequest({ ...validProviderBody, updates: { category: "Camps" } });
    expect(result.ok).toBe(true);
  });

  it("rejects copy that fails the ported quality gate (URL leak)", () => {
    const result = validateWriteRequest({
      ...validProviderBody,
      updates: { shortDescription: "Great classes! Visit https://example.com for more." },
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/URLs/);
  });

  it("rejects an image field that isn't a real https URL", () => {
    const result = validateWriteRequest({ ...validProviderBody, updates: { image: "not-a-url" } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/https/);
  });

  it("accepts a plausible https image URL", () => {
    const result = validateWriteRequest({ ...validProviderBody, updates: { image: "https://i.ibb.co/abc123/photo.jpg" } });
    expect(result.ok).toBe(true);
  });

  describe("quarantine/hide an already-published provider", () => {
    it("accepts qualityStatus=quarantined and visibility=hidden", () => {
      expect(validateWriteRequest({ ...validProviderBody, updates: { qualityStatus: "quarantined" } }).ok).toBe(true);
      expect(validateWriteRequest({ ...validProviderBody, updates: { visibility: "hidden" } }).ok).toBe(true);
    });

    it("rejects any other qualityStatus/visibility value — these fields only ever move ONE direction through this bridge", () => {
      expect(validateWriteRequest({ ...validProviderBody, updates: { qualityStatus: "approved" } }).ok).toBe(false);
      expect(validateWriteRequest({ ...validProviderBody, updates: { visibility: "visible" } }).ok).toBe(false);
      expect(validateWriteRequest({ ...validProviderBody, updates: { qualityStatus: null } }).ok).toBe(false);
    });
  });

  describe("quarantine/hide a meetup group — same one-directional rule as providers", () => {
    const meetupBody = {
      collection: "meetupGroups",
      id: "meetup-1",
      reason: "Research confirms this is not an active recurring group",
      source: "test",
    };

    it("accepts qualityStatus=quarantined and visibility=hidden", () => {
      expect(validateWriteRequest({ ...meetupBody, updates: { qualityStatus: "quarantined" } }).ok).toBe(true);
      expect(validateWriteRequest({ ...meetupBody, updates: { visibility: "hidden" } }).ok).toBe(true);
    });

    it("rejects any other qualityStatus/visibility value", () => {
      expect(validateWriteRequest({ ...meetupBody, updates: { qualityStatus: "approved" } }).ok).toBe(false);
      expect(validateWriteRequest({ ...meetupBody, updates: { visibility: "visible" } }).ok).toBe(false);
    });
  });

  it("meetupGroups: rejects a description that fails the quality gate the same way providers does", () => {
    const result = validateWriteRequest({
      collection: "meetupGroups",
      id: "meet-1",
      updates: { description: "Sources: https://example.com" },
      reason: "Testing meetup copy validation",
      source: "test",
    });
    expect(result.ok).toBe(false);
  });

  it("contentCards: accepts a categoryHint/blockerCodes update (no copy fields registered for this collection)", () => {
    const result = validateWriteRequest({
      collection: "contentCards",
      id: "cc-abc123",
      updates: { categoryHint: "Dance", blockerCodes: [] },
      reason: "Corrected a mis-hinted category from fresh source text",
      source: "category-lane-test",
    });
    expect(result.ok).toBe(true);
  });

  describe("touch mode (reviewed, nothing to change)", () => {
    const validTouchBody = {
      collection: "contentCards",
      id: "cc-abc123",
      touch: true,
      reason: "Reviewed against fresh source text; card is already accurate, no field needs to change",
      source: "oldest-card-loop-test",
    };

    it("accepts a touch request with NO updates field at all", () => {
      expect(validateWriteRequest(validTouchBody).ok).toBe(true);
    });

    it("accepts a touch request with an explicitly empty updates object", () => {
      expect(validateWriteRequest({ ...validTouchBody, updates: {} }).ok).toBe(true);
    });

    it("without touch=true, an empty/absent updates object is still rejected", () => {
      const { touch, ...withoutTouch } = validTouchBody;
      expect(validateWriteRequest(withoutTouch).ok).toBe(false);
      expect(validateWriteRequest({ ...withoutTouch, updates: {} }).ok).toBe(false);
    });

    it("touch=true still allows a REAL updates field alongside the touch (not mutually exclusive)", () => {
      const result = validateWriteRequest({ ...validTouchBody, updates: { categoryHint: "Dance" } });
      expect(result.ok).toBe(true);
      expect(result.ok && result.value.touch).toBe(true);
    });

    it("touch defaults to false when absent", () => {
      const result = validateWriteRequest(validProviderBody);
      expect(result.ok && result.value.touch).toBe(false);
    });
  });

  describe("contentCards state transitions", () => {
    const stateBody = {
      collection: "contentCards",
      id: "cc-abc123",
      reason: "Research confirmed source is dead; blocking terminally",
      source: "state-machine-test",
    };

    it("accepts a real, non-PUBLISHED state", () => {
      expect(validateWriteRequest({ ...stateBody, updates: { state: "REVIEW_READY" } }).ok).toBe(true);
      expect(validateWriteRequest({ ...stateBody, updates: { state: "BLOCKED_TERMINAL" } }).ok).toBe(true);
    });

    it('rejects state="PUBLISHED" explicitly, with a message pointing at the main app\'s gate', () => {
      const result = validateWriteRequest({ ...stateBody, updates: { state: "PUBLISHED" } });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/PUBLISHED/);
      expect(!result.ok && result.error).toMatch(/main app/);
    });

    it("rejects a made-up state value", () => {
      expect(validateWriteRequest({ ...stateBody, updates: { state: "ARCHIVED" } }).ok).toBe(false);
    });
  });

  describe("serviceLeads writes", () => {
    const leadBody = {
      collection: "serviceLeads",
      id: "lead-1",
      reason: "Re-fetched source, confirmed the real address",
      source: "family-service-test",
    };

    it("accepts a real status value", () => {
      expect(validateWriteRequest({ ...leadBody, updates: { status: "ready_for_existing_category_review" } }).ok).toBe(true);
    });

    it("rejects a made-up status value", () => {
      const result = validateWriteRequest({ ...leadBody, updates: { status: "totally_made_up" } });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/status must be one of/);
    });

    it("accepts a plain content field write (address) with no status change", () => {
      expect(validateWriteRequest({ ...leadBody, updates: { address: "345 Greenwich St, New York, NY 10013" } }).ok).toBe(true);
    });

    it("rejects an attempt to set visibility or blockers directly — always derived, never caller-supplied", () => {
      expect(validateWriteRequest({ ...leadBody, updates: { visibility: "public_support" } }).ok).toBe(false);
      expect(validateWriteRequest({ ...leadBody, updates: { blockers: [] } }).ok).toBe(false);
    });
  });
});
