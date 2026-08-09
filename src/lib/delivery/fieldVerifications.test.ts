import { describe, expect, it } from "vitest";
import { mergeFieldVerifications, verificationCoverage } from "./fieldVerifications";

const WRITABLE = ["phone", "address", "email", "shortDescription", "neighborhood"];
const NOW = "2026-08-09T12:00:00.000Z";

describe("mergeFieldVerifications — the thing lastReviewedAt could not say", () => {
  it("records a CONFIRMED field, which changes no bytes and previously left no trace at all", () => {
    // A reviewer who reads a phone number, checks it against the operator's own site and finds it
    // right has done real work. Before this, the next pass had no way to know and would check again.
    const r = mergeFieldVerifications([], [{ field: "phone", verdict: "confirmed", source: "operator's own contact page" }], "loop", NOW, WRITABLE);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual([
      { field: "phone", verifiedAt: NOW, verifiedBy: "loop", verdict: "confirmed", source: "operator's own contact page" },
    ]);
  });

  it("REPLACES a field's entry rather than appending, so the array answers one question directly", () => {
    // Appending was the obvious design and the wrong one: a field checked on five passes would carry
    // five entries on exactly the records the loop works hardest.
    const prior = [
      { field: "phone", verifiedAt: "2026-01-01T00:00:00.000Z", verifiedBy: "old", verdict: "needs_human" as const },
      { field: "address", verifiedAt: "2026-01-01T00:00:00.000Z", verifiedBy: "old", verdict: "confirmed" as const },
    ];
    const r = mergeFieldVerifications(prior, [{ field: "phone", verdict: "corrected" }], "loop", NOW, WRITABLE);
    expect(r.value).toHaveLength(2);
    expect(r.value!.find((e) => e.field === "phone")).toMatchObject({ verdict: "corrected", verifiedAt: NOW });
    // The untouched field keeps its own, older timestamp — which is the entire point.
    expect(r.value!.find((e) => e.field === "address")!.verifiedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("refuses a verification for a field this bridge cannot write", () => {
    // Otherwise a caller could stamp confidence onto anything at all, including fields nobody can see.
    const r = mergeFieldVerifications([], [{ field: "secretInternalScore", verdict: "confirmed" }], "loop", NOW, WRITABLE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not a writable field/);
  });

  it("refuses an unknown verdict, a duplicate field, an empty array and an empty source", () => {
    expect(mergeFieldVerifications([], [{ field: "phone", verdict: "looks-fine" as never }], "loop", NOW, WRITABLE).ok).toBe(false);
    expect(mergeFieldVerifications([], [{ field: "phone", verdict: "confirmed" }, { field: "phone", verdict: "corrected" }], "loop", NOW, WRITABLE).error)
      .toMatch(/duplicate entry/);
    expect(mergeFieldVerifications([], [], "loop", NOW, WRITABLE).ok).toBe(false);
    expect(mergeFieldVerifications([], [{ field: "phone", verdict: "confirmed", source: "   " }], "loop", NOW, WRITABLE).error)
      .toMatch(/present but empty/);
  });

  it("tolerates a record whose existing value is absent or malformed", () => {
    for (const prior of [undefined, null, "not an array", [null, { nope: true }]]) {
      const r = mergeFieldVerifications(prior, [{ field: "email", verdict: "confirmed" }], "loop", NOW, WRITABLE);
      expect(r.ok).toBe(true);
      expect(r.value!.some((e) => e.field === "email")).toBe(true);
    }
  });
});

describe("verificationCoverage — why a 'reviewed' badge should not read lastReviewedAt", () => {
  it("separates fields somebody stands behind from fields escalated to a human", () => {
    const entries = [
      { field: "phone", verifiedAt: NOW, verifiedBy: "loop", verdict: "corrected" as const },
      { field: "address", verifiedAt: NOW, verifiedBy: "loop", verdict: "confirmed" as const },
      { field: "neighborhood", verifiedAt: NOW, verifiedBy: "loop", verdict: "needs_human" as const },
    ];
    expect(verificationCoverage(entries)).toEqual({ verified: 3, standsBehind: 2, escalated: 1 });
  });

  it("reports zero for the ~1,000 records written before this existed, which is honest", () => {
    // Nothing back-fills history. Their lastReviewedAt remains an over-broad claim, and per-field
    // provenance starts now rather than pretending to be retroactive.
    expect(verificationCoverage(undefined)).toEqual({ verified: 0, standsBehind: 0, escalated: 0 });
  });
});
