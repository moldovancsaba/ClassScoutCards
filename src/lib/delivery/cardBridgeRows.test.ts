import { describe, expect, it } from "vitest";
import { clampLimit, parseSimpleFilter, DEFAULT_LIMIT, MAX_LIMIT } from "./cardBridgeRows";

describe("clampLimit", () => {
  it("falls back to DEFAULT_LIMIT for missing/invalid input and caps at MAX_LIMIT", () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(clampLimit("abc")).toBe(DEFAULT_LIMIT);
    expect(clampLimit(0)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(1000)).toBe(MAX_LIMIT);
    expect(clampLimit(10)).toBe(10);
  });
});

describe("parseSimpleFilter", () => {
  it("returns an empty filter when no rawFilter is supplied", () => {
    expect(parseSimpleFilter("providers", undefined)).toEqual({ ok: true, filter: {} });
  });

  it("rejects invalid JSON", () => {
    expect(parseSimpleFilter("providers", "{not json").ok).toBe(false);
  });

  it("rejects a non-object filter (array/primitive)", () => {
    expect(parseSimpleFilter("providers", "[1,2,3]").ok).toBe(false);
    expect(parseSimpleFilter("providers", '"just a string"').ok).toBe(false);
  });

  it("accepts an equality filter on a field the collection's read projection exposes", () => {
    const result = parseSimpleFilter("providers", JSON.stringify({ category: "Camps" }));
    expect(result).toEqual({ ok: true, filter: { category: "Camps" } });
  });

  it("rejects a field not in the collection's read projection", () => {
    const result = parseSimpleFilter("providers", JSON.stringify({ ssn: "123-45-6789" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a Mongo operator key ($where, $ne, etc.) — no query-injection surface", () => {
    expect(parseSimpleFilter("providers", JSON.stringify({ $where: "1==1" })).ok).toBe(false);
    expect(parseSimpleFilter("providers", JSON.stringify({ category: { $ne: "Classes" } })).ok).toBe(false);
  });

  it("rejects _id even though it's technically a projection key", () => {
    expect(parseSimpleFilter("providers", JSON.stringify({ _id: "x" })).ok).toBe(false);
  });

  it("works per-collection — a contentCards-only field is rejected for providers and vice versa", () => {
    expect(parseSimpleFilter("providers", JSON.stringify({ state: "PUBLISHED" })).ok).toBe(false);
    expect(parseSimpleFilter("contentCards", JSON.stringify({ state: "PUBLISHED" })).ok).toBe(true);
  });
});
