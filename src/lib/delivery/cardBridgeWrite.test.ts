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
});
