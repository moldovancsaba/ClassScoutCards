import { describe, expect, it } from "vitest";
import { computeContentCardIdentity, slugifyProviderName, validateSplitRequest } from "./cardBridgeSplit";

const validContentCardsBody = {
  collection: "contentCards",
  parentId: "cc-parent123",
  reason: "one org, two real locations",
  source: "test",
  children: [
    { title: "Org A - Manhattan", sourceUrl: "https://org.example.com/manhattan", categoryHint: "Camps", boroughGuess: "Manhattan", neighborhoodGuess: "Chelsea" },
    { title: "Org A - Brooklyn", sourceUrl: "https://org.example.com/brooklyn", categoryHint: "Camps", boroughGuess: "Brooklyn", neighborhoodGuess: "Park Slope" },
  ],
};

const validProvidersBody = {
  collection: "providers",
  parentId: "prov-parent",
  reason: "aggregator page listing two real businesses",
  source: "test",
  children: [
    { name: "Business A", website: "https://a.example.com", category: "Classes", borough: "Manhattan", neighborhood: "Chelsea" },
    { name: "Business B", website: "https://b.example.com", category: "Classes", borough: "Brooklyn", neighborhood: "Park Slope" },
  ],
};

describe("computeContentCardIdentity", () => {
  it("matches the real formula's shape: cc-<24 hex chars>", () => {
    const identity = computeContentCardIdentity({
      title: "Steve & Kate's Camp",
      sourceUrl: "https://steveandkatescamp.com/manhattan-upper-west-side/",
      categoryHint: "Camps",
      boroughGuess: "Manhattan",
      neighborhoodGuess: "Upper West Side",
    });
    expect(identity.contentCardId).toMatch(/^cc-[0-9a-f]{24}$/);
    expect(identity.normalizedTitle).toBe("steve & kate's camp");
    expect(identity.sourceHost).toBe("steveandkatescamp.com");
  });

  it("is deterministic -- same inputs always produce the same id", () => {
    const parts = { title: "X", sourceUrl: "https://x.example.com/", categoryHint: "Camps", boroughGuess: "Manhattan", neighborhoodGuess: "Chelsea" };
    expect(computeContentCardIdentity(parts)).toEqual(computeContentCardIdentity(parts));
  });

  it("differs when boroughGuess/neighborhoodGuess differ -- the real case that makes multi-location splits safe", () => {
    const a = computeContentCardIdentity({ title: "X", sourceUrl: "https://x.example.com/", categoryHint: "Camps", boroughGuess: "Manhattan", neighborhoodGuess: "Chelsea" });
    const b = computeContentCardIdentity({ title: "X", sourceUrl: "https://x.example.com/", categoryHint: "Camps", boroughGuess: "Brooklyn", neighborhoodGuess: "Park Slope" });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("a disambiguator changes the fingerprint (collision-avoidance path)", () => {
    const parts = { title: "X", sourceUrl: "https://x.example.com/", categoryHint: "Camps", boroughGuess: "Manhattan", neighborhoodGuess: "Chelsea" };
    const a = computeContentCardIdentity(parts);
    const b = computeContentCardIdentity({ ...parts, disambiguator: "split-1" });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe("slugifyProviderName", () => {
  it("matches the real classscoutAdapter.ts slugify behavior", () => {
    expect(slugifyProviderName("Camp Orot!")).toBe("camp-orot");
    expect(slugifyProviderName("  Steve & Kate's Camp  ")).toBe("steve-kate-s-camp");
  });
});

describe("validateSplitRequest", () => {
  it("accepts a valid contentCards split", () => {
    expect(validateSplitRequest(validContentCardsBody).ok).toBe(true);
  });

  it("accepts a valid providers split", () => {
    expect(validateSplitRequest(validProvidersBody).ok).toBe(true);
  });

  it("rejects fewer than 2 children", () => {
    const body = { ...validContentCardsBody, children: [validContentCardsBody.children[0]] };
    const result = validateSplitRequest(body);
    expect(result.ok).toBe(false);
  });

  it("rejects a child missing its own distinguishing source", () => {
    const body = { ...validContentCardsBody, children: [{ ...validContentCardsBody.children[0], sourceUrl: undefined }, validContentCardsBody.children[1]] };
    const result = validateSplitRequest(body);
    expect(result.ok).toBe(false);
  });

  it("rejects two children sharing the same source -- the anti-duplicate rule", () => {
    const body = {
      ...validContentCardsBody,
      children: [validContentCardsBody.children[0], { ...validContentCardsBody.children[1], sourceUrl: validContentCardsBody.children[0].sourceUrl }],
    };
    const result = validateSplitRequest(body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/same sourceUrl/);
  });

  it("rejects an unsupported collection", () => {
    const result = validateSplitRequest({ ...validContentCardsBody, collection: "meetupGroups" });
    expect(result.ok).toBe(false);
  });

  it("rejects a provider child with an invalid category", () => {
    const body = { ...validProvidersBody, children: [{ ...validProvidersBody.children[0], category: "NotARealCategory" }, validProvidersBody.children[1]] };
    const result = validateSplitRequest(body);
    expect(result.ok).toBe(false);
  });

  it("defaults dryRun to true", () => {
    const result = validateSplitRequest(validContentCardsBody);
    expect(result.ok && result.value.dryRun).toBe(true);
  });
});
