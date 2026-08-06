import { describe, expect, it } from "vitest";
import { clampLimit, isAllowedState, MAX_LIMIT, DEFAULT_LIMIT } from "./contentCardsBridge";

describe("clampLimit", () => {
  it("falls back to DEFAULT_LIMIT for missing/non-numeric/zero/negative input", () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(null)).toBe(DEFAULT_LIMIT);
    expect(clampLimit("")).toBe(DEFAULT_LIMIT);
    expect(clampLimit("not-a-number")).toBe(DEFAULT_LIMIT);
    expect(clampLimit(0)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(-5)).toBe(DEFAULT_LIMIT);
  });

  it("passes through a valid in-range value, truncating decimals", () => {
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit("10")).toBe(10);
    expect(clampLimit(7.9)).toBe(7);
  });

  it("caps anything above MAX_LIMIT", () => {
    expect(clampLimit(1000)).toBe(MAX_LIMIT);
    expect(clampLimit(MAX_LIMIT + 1)).toBe(MAX_LIMIT);
  });

  it("MAX_LIMIT itself passes through unchanged", () => {
    expect(clampLimit(MAX_LIMIT)).toBe(MAX_LIMIT);
  });
});

describe("isAllowedState", () => {
  it("accepts every real content-card state", () => {
    for (const s of ["DISCOVERED", "EXTRACTING", "EXTRACTED", "PREPARING", "BLOCKED_REPAIRABLE",
      "BLOCKED_TERMINAL", "PARKED_COOLDOWN", "REVIEW_READY", "PUBLISHED", "QUARANTINED"]) {
      expect(isAllowedState(s)).toBe(true);
    }
  });

  it("rejects an unknown string, non-string, or empty value", () => {
    expect(isAllowedState("NOT_A_REAL_STATE")).toBe(false);
    expect(isAllowedState("published")).toBe(false); // case-sensitive
    expect(isAllowedState(undefined)).toBe(false);
    expect(isAllowedState(null)).toBe(false);
    expect(isAllowedState(42)).toBe(false);
    expect(isAllowedState("")).toBe(false);
  });
});
