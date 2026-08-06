import { describe, expect, it } from "vitest";
import { isBridgeCollectionKey, rejectedFields, BRIDGE_REGISTRY } from "./cardBridgeRegistry";

describe("isBridgeCollectionKey", () => {
  it("accepts the three registered collections", () => {
    expect(isBridgeCollectionKey("contentCards")).toBe(true);
    expect(isBridgeCollectionKey("providers")).toBe(true);
    expect(isBridgeCollectionKey("meetupGroups")).toBe(true);
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

  it("flags any key outside the allow-list, e.g. an attempt to overwrite id/website/email", () => {
    expect(rejectedFields("providers", { id: "hijack", shortDescription: "x" })).toEqual(["id"]);
    expect(rejectedFields("providers", { website: "https://evil.example" })).toEqual(["website"]);
  });

  it("every registered collection's writableFields is non-empty and copyFields is a subset of it", () => {
    for (const key of Object.keys(BRIDGE_REGISTRY) as Array<keyof typeof BRIDGE_REGISTRY>) {
      const config = BRIDGE_REGISTRY[key];
      expect(config.writableFields.length).toBeGreaterThan(0);
      for (const copyField of config.copyFields) {
        expect(config.writableFields).toContain(copyField);
      }
    }
  });
});
