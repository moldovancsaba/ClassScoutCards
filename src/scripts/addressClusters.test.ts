import { describe, expect, it } from "vitest";
import { addressClusters, normalizeStreetAddress } from "./addressClusters";

describe("normalizeStreetAddress — one address must not split into two clusters over punctuation", () => {
  it("folds suffix spelling, case, punctuation and the city/state/ZIP tail together", () => {
    const forms = [
      "653 Schenck Ave, Brooklyn, NY 11207",
      "653 Schenck Avenue, Brooklyn, NY",
      "653 schenck ave.",
    ];
    const keys = new Set(forms.map(normalizeStreetAddress));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("653 schenck ave");
  });

  it("returns null for a placeholder, which is shared by design and would swamp the scan", () => {
    // 288 live providers store the neighbourhood as the address. Clustering those would only ever
    // establish that two businesses are in the same neighbourhood.
    expect(normalizeStreetAddress("Gowanus, Brooklyn, NYC")).toBeNull();
    expect(normalizeStreetAddress("Upper East Side, Manhattan, NYC")).toBeNull();
    expect(normalizeStreetAddress("")).toBeNull();
    expect(normalizeStreetAddress(null)).toBeNull();
  });

  it("keeps the pier form the Chelsea Piers cluster is written in", () => {
    expect(normalizeStreetAddress("62 Chelsea Piers, New York, NY 10011")).toBe("62 chelsea piers");
    expect(normalizeStreetAddress("Pier 59, Chelsea Piers, New York, NY 10011")).toBe("pier 59 chelsea piers");
  });

  it("folds a directional prefix's abbreviation and spelled-out form together (2026-08-10 finding)", () => {
    // cardBridgeCreate.ts's duplicate-address check missed "64 E 4th St" against an existing "64 East
    // 4th Street" -- the same building -- because only street-TYPE suffixes were normalised, not
    // directional prefixes. Caught before a create ran, by the generated id carrying a "-2" for a name
    // that was already live.
    const forms = ["64 E 4th St, New York, NY 10003", "64 East 4th Street, New York, NY 10003"];
    expect(new Set(forms.map(normalizeStreetAddress)).size).toBe(1);
  });
});

describe("addressClusters — the batch-27 finding, turned into a measurement", () => {
  it("finds the seven-record Chelsea Piers programme cluster and calls it one-operator", () => {
    const rows = [
      { id: "fieldhouse", name: "Chelsea Piers Field House", address: "Pier 62, Chelsea Piers, New York, NY 10011" },
      { id: "gym", name: "Chelsea Piers Gymnastics Camp", address: "62 Chelsea Piers, New York, NY 10011" },
      { id: "ninja", name: "Chelsea Piers Ninja & Parkour Camp", address: "62 Chelsea Piers, New York, NY 10011" },
      { id: "soccer", name: "Chelsea Piers Soccer Camps", address: "62 Chelsea Piers, New York, NY 10011" },
      { id: "skyrink", name: "Chelsea Piers Sky Rink", address: "61 Chelsea Piers, New York, NY 10011" },
    ];
    const clusters = addressClusters(rows);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].address).toBe("62 chelsea piers");
    expect(clusters[0].records.map((r) => r.id)).toEqual(["gym", "ninja", "soccer"]);
    expect(clusters[0].classify).toBe("one-operator");
    // Sky Rink (Pier 61) and the Field House (Pier 62) are separate venues in the same complex and must
    // NOT be swept in — the pier number is the whole difference between a venue and a duplicate here.
  });

  it("does not treat a genuinely shared building as a defect", () => {
    // Pier 40 really does house three unrelated operators, each of which deserves its own listing.
    const rows = [
      { id: "dusc", name: "Downtown United Soccer Club (DUSC)", address: "Pier 40, 353 West St, New York, NY" },
      { id: "boathouse", name: "Village Community Boathouse Youth Rowing", address: "Pier 40, 353 West St, New York, NY" },
      { id: "baseball", name: "Pier 40 Baseball", address: "Pier 40, 353 West St, New York, NY" },
    ];
    expect(addressClusters(rows)[0].classify).toBe("mixed");
  });

  it("UNDER-COUNTS one operator whose cards do not share a leading token — read `mixed` as unresolved", () => {
    // All three are the Marlene Meyerson JCC Manhattan at 334 Amsterdam Ave, and the classifier misses it.
    // Recorded as a test rather than fixed, because a smarter classifier would start guessing.
    const rows = [
      { id: "a", name: "Marlene Meyerson JCC Manhattan", address: "334 Amsterdam Ave, New York, NY 10023" },
      { id: "b", name: "Marlene Meyerson JCC Manhattan Sports", address: "334 Amsterdam Ave, New York, NY 10023" },
      { id: "c", name: "Day Camp @ the JCC", address: "334 Amsterdam Ave, New York, NY 10023" },
    ];
    expect(addressClusters(rows)[0].classify).toBe("mixed");
  });

  it("ignores a record with no street address rather than clustering it with another", () => {
    const rows = [
      { id: "a", name: "A", address: "Chelsea, Manhattan, NYC" },
      { id: "b", name: "B", address: "Chelsea, Manhattan, NYC" },
    ];
    expect(addressClusters(rows)).toEqual([]);
  });
});
