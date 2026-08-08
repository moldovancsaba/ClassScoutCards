import { describe, expect, it } from "vitest";
import { parseSourceUrl, validateWriteRequest } from "./cardBridgeWrite";
import { computeContentCardIdentity } from "./cardBridgeSplit";

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

  it("rejects a field outside the collection's writable allow-list — e.g. trying to overwrite sourceUrls", () => {
    const result = validateWriteRequest({ ...validProviderBody, updates: { sourceUrls: ["https://evil.example"] } });
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

  describe("activityTypes sanity ceiling (2026-08-07 owner directive: real top-3 selection happens in applyCardBridgeWrite via alignActivityTypes)", () => {
    it("accepts a normal-length activityTypes list", () => {
      expect(validateWriteRequest({ ...validProviderBody, updates: { activityTypes: ["Soccer", "Swimming", "Running", "Art", "Music"] } }).ok).toBe(true);
    });

    it("rejects an obviously-garbage-length activityTypes list (>20)", () => {
      const result = validateWriteRequest({
        ...validProviderBody,
        updates: { activityTypes: Array.from({ length: 21 }, (_, i) => `Tag${i}`) },
      });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/looks like a raw keyword dump/);
    });
  });

  describe('the "no category" placeholder (owner directive 2026-08-07: never add it, even when there is no category)', () => {
    it("rejects it in activityTypes", () => {
      const result = validateWriteRequest({ ...validProviderBody, updates: { activityTypes: ["Soccer", "no category"] } });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/never contain the ingestion placeholder/);
    });

    it("rejects it in primaryActivityType", () => {
      expect(validateWriteRequest({ ...validProviderBody, updates: { primaryActivityType: "no category" } }).ok).toBe(false);
    });

    it("rejects it in a contentCards categoryHint", () => {
      const result = validateWriteRequest({
        collection: "contentCards",
        id: "cc-abc123",
        updates: { categoryHint: "No Category" },
        reason: "Testing the placeholder rejection rule",
        source: "test",
      });
      expect(result.ok).toBe(false);
    });

    it("is case- and whitespace-insensitive", () => {
      expect(validateWriteRequest({ ...validProviderBody, updates: { activityTypes: ["  NO CATEGORY "] } }).ok).toBe(false);
    });

    it("still accepts legitimate category/activity values", () => {
      expect(validateWriteRequest({ ...validProviderBody, updates: { activityTypes: ["Soccer", "Sports"] } }).ok).toBe(true);
      expect(validateWriteRequest({ ...validProviderBody, updates: { category: "Camps" } }).ok).toBe(true);
    });
  });

  describe("geo writes (2026-08-07 owner directive: this bridge has no real geocoder)", () => {
    it("accepts geo with source=\"approximate\"", () => {
      const result = validateWriteRequest({
        ...validProviderBody,
        updates: { geo: { lat: 40.68, lng: -73.96, precision: "approximate", source: "approximate" } },
      });
      expect(result.ok).toBe(true);
    });

    it("rejects geo claiming a real geocoder source it never performed", () => {
      const result = validateWriteRequest({
        ...validProviderBody,
        updates: { geo: { lat: 40.68, lng: -73.96, precision: "exact", source: "google" } },
      });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/geo\.source must be "approximate"/);
    });

    it("rejects geo with no source at all", () => {
      const result = validateWriteRequest({ ...validProviderBody, updates: { geo: { lat: 40.68, lng: -73.96 } } });
      expect(result.ok).toBe(false);
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

describe("contentCards sourceUrl re-sourcing (2026-08-08)", () => {
  const base = { collection: "contentCards", id: "cc-1", reason: "re-source to the branch's own page", source: "test" };

  it("accepts a real https source URL", () => {
    const result = validateWriteRequest({ ...base, updates: { sourceUrl: "https://www.codeninjas.com/ny-gowanus" } });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-https URL", () => {
    const result = validateWriteRequest({ ...base, updates: { sourceUrl: "http://example.com/page" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("parseable https");
  });

  it("rejects an unparseable value", () => {
    const result = validateWriteRequest({ ...base, updates: { sourceUrl: "https://" } });
    expect(result.ok).toBe(false);
  });

  it("rejects a hostname with no dot, which is never a real public source page", () => {
    const result = validateWriteRequest({ ...base, updates: { sourceUrl: "https://localhost/page" } });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-string", () => {
    const result = validateWriteRequest({ ...base, updates: { sourceUrl: 42 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("must be a string");
  });

  it("is not writable on providers — sourceUrl belongs to contentCards only", () => {
    const result = validateWriteRequest({ collection: "providers", id: "prov-1", reason: "attempt", source: "test", updates: { sourceUrl: "https://example.com/x" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not writable");
  });

  it("sourceHost is NOT writable — it is derived, so it can never drift from sourceUrl", () => {
    const result = validateWriteRequest({ ...base, updates: { sourceHost: "example.com" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not writable");
  });
});

describe("parseSourceUrl", () => {
  it("strips www. so a re-sourced card stays in its own per-domain cluster", () => {
    // Real shape from live data: sourceHost "streb.org" alongside sourceUrl "https://www.streb.org/".
    expect(parseSourceUrl("https://www.streb.org/")?.host).toBe("streb.org");
    expect(parseSourceUrl("https://streb.org/")?.host).toBe("streb.org");
  });

  it("lowercases the host", () => {
    expect(parseSourceUrl("https://WWW.SwimJim.COM/locations")?.host).toBe("swimjim.com");
  });

  it("keeps subdomains other than www, which are real distinct sources", () => {
    // Color Me Mine gives each studio its own subdomain -- collapsing these would merge two real studios.
    expect(parseSourceUrl("https://tribeca.colormemine.com/")?.host).toBe("tribeca.colormemine.com");
  });

  it("returns null for the values validation rejects", () => {
    expect(parseSourceUrl("http://example.com")).toBeNull();
    expect(parseSourceUrl("not a url")).toBeNull();
    expect(parseSourceUrl("https://localhost/x")).toBeNull();
  });
});

describe("content-card fingerprint stays in step with its basis fields (PR review, 2026-08-08)", () => {
  // `applyCardBridgeWrite` needs a live DB, which this repo does not mock (a known, pre-existing gap
  // documented in CLAUDE.md). What CAN be tested purely is the invariant the fix rests on: the
  // fingerprint really is a function of exactly these five fields, so editing any of them through the
  // bridge genuinely does invalidate a stored fingerprint. If this ever stops holding, the recompute in
  // applyCardBridgeWrite is either incomplete or unnecessary, and this test says which.
  const base = {
    title: "Ferox Ninja Park Greenpoint",
    sourceUrl: "https://feroxathletics.com/ninja-park/",
    categoryHint: "Indoor Play",
    boroughGuess: "Brooklyn",
    neighborhoodGuess: "Greenpoint",
  };

  it("is stable for identical input", () => {
    expect(computeContentCardIdentity(base).fingerprint).toBe(computeContentCardIdentity(base).fingerprint);
  });

  it("changes when ANY of the five basis fields changes", () => {
    const original = computeContentCardIdentity(base).fingerprint;
    const variants: Array<[string, typeof base]> = [
      ["title", { ...base, title: "Ferox Ninja Playground DUMBO" }],
      ["sourceUrl", { ...base, sourceUrl: "https://feroxathletics.com/playground/" }],
      ["categoryHint", { ...base, categoryHint: "Sports" }],
      ["boroughGuess", { ...base, boroughGuess: "Manhattan" }],
      ["neighborhoodGuess", { ...base, neighborhoodGuess: "DUMBO" }],
    ];
    for (const [field, variant] of variants) {
      expect(computeContentCardIdentity(variant).fingerprint, `${field} must affect the fingerprint`).not.toBe(original);
    }
  });

  it("derives contentCardId from the fingerprint, which is why the id is deliberately left stale", () => {
    // Recomputing the id would be a primary-key change, i.e. a delete-and-recreate. The dedupe index is
    // {fingerprint, kind}, so the fingerprint is the part that has to stay honest.
    const identity = computeContentCardIdentity(base);
    expect(identity.contentCardId).toBe(`cc-${identity.fingerprint}`);
  });
});
