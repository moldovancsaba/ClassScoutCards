import { describe, expect, it } from "vitest";
import { isBridgeCollectionKey, rejectedFields, BRIDGE_REGISTRY } from "./cardBridgeRegistry";

const WRITABLE_COLLECTIONS = ["contentCards", "providers", "meetupGroups", "serviceLeads"] as const;
const READ_ONLY_COLLECTIONS = ["servicePlaceFacts", "serviceReviewPackets", "serviceTasks"] as const;

describe("isBridgeCollectionKey", () => {
  it("accepts every registered collection, writable or read-only", () => {
    for (const key of [...WRITABLE_COLLECTIONS, ...READ_ONLY_COLLECTIONS]) {
      expect(isBridgeCollectionKey(key)).toBe(true);
    }
  });

  it("rejects anything not explicitly registered", () => {
    expect(isBridgeCollectionKey("classscoutContentCards")).toBe(false); // real mongo name, not the key
    expect(isBridgeCollectionKey("users")).toBe(false);
    expect(isBridgeCollectionKey(undefined)).toBe(false);
    expect(isBridgeCollectionKey(42)).toBe(false);
  });
});

describe("rejectedFields", () => {
  it("returns [] when every update key is allow-listed", () => {
    expect(rejectedFields("providers", { shortDescription: "x", category: "Classes" })).toEqual([]);
  });

  it("flags any key outside the allow-list, e.g. an attempt to overwrite id/sourceUrls", () => {
    expect(rejectedFields("providers", { id: "hijack", shortDescription: "x" })).toEqual(["id"]);
    // sourceUrls is the discovery pipeline's own provenance trail — readable, never writable.
    expect(rejectedFields("providers", { sourceUrls: ["https://evil.example"] })).toEqual(["sourceUrls"]);
  });

  // (2026-08-08) `website` moved from read-only to writable — a live provider's public link can be
  // flatly dead (Barking Cat Studio's .com is a parked page; the studio is at .net) and there was no
  // way to fix it. Pinned so a future narrowing of the allow-list has to be deliberate.
  it("providers.website is writable, so a dead public link can be corrected", () => {
    expect(rejectedFields("providers", { website: "https://www.barkingcatstudio.net/" })).toEqual([]);
  });

  it("every WRITABLE collection's writableFields is non-empty and copyFields is a subset of it", () => {
    for (const key of WRITABLE_COLLECTIONS) {
      const config = BRIDGE_REGISTRY[key];
      expect(config.writableFields.length).toBeGreaterThan(0);
      for (const copyField of config.copyFields) {
        expect(config.writableFields).toContain(copyField);
      }
    }
  });

  it("every READ-ONLY collection has an empty writableFields — any update attempt is rejected", () => {
    for (const key of READ_ONLY_COLLECTIONS) {
      const config = BRIDGE_REGISTRY[key];
      expect(config.writableFields).toEqual([]);
      expect(rejectedFields(key, { anyField: "x" })).toEqual(["anyField"]);
    }
  });
});
