import { describe, expect, it } from "vitest";
import {
  findCanonicalArea,
  findCanonicalBorough,
  findCanonicalLANeighborhood,
  findCanonicalNeighborhood,
  findRealNeighborhood,
  neighborhoodGroup,
  NEIGHBORHOODS,
  REAL_NEIGHBORHOODS_EXTRA,
  type Borough,
  resolveRegionAndNeighborhood,
} from "./locations";

describe("findCanonicalBorough", () => {
  it("matches exact and case-insensitive borough names", () => {
    expect(findCanonicalBorough("Manhattan")).toBe("Manhattan");
    expect(findCanonicalBorough("brooklyn")).toBe("Brooklyn");
  });

  it("tolerates small typos (edit distance <= 2)", () => {
    expect(findCanonicalBorough("Manhatan")).toBe("Manhattan");
    expect(findCanonicalBorough("Brookyln")).toBe("Brooklyn");
  });

  it("resolves county aliases", () => {
    expect(findCanonicalBorough("Kings County")).toBe("Brooklyn");
    expect(findCanonicalBorough("New York County")).toBe("Manhattan");
  });

  it("rejects multi-borough strings and generic NYC -- these must fall to unresolved, not a fake bucket", () => {
    expect(findCanonicalBorough("Manhattan/Brooklyn")).toBeNull();
    expect(findCanonicalBorough("Manhattan / Brooklyn / Queens")).toBeNull();
    expect(findCanonicalBorough("NYC")).toBeNull();
  });

  it("rejects garbage/empty input", () => {
    expect(findCanonicalBorough("")).toBeNull();
    expect(findCanonicalBorough(null)).toBeNull();
    expect(findCanonicalBorough("Charlotte, NC")).toBeNull();
  });
});

describe("findCanonicalNeighborhood", () => {
  it("matches an exact neighborhood within its borough", () => {
    expect(findCanonicalNeighborhood("Brooklyn", "Ditmas Park")).toBe("Ditmas Park");
    expect(findCanonicalNeighborhood("Manhattan", "chelsea")).toBe("Chelsea");
  });

  it("applies the static alias map (East Harlem -> Harlem)", () => {
    expect(findCanonicalNeighborhood("Manhattan", "East Harlem")).toBe("Harlem");
    expect(findCanonicalNeighborhood("Manhattan", "Hamilton Heights")).toBe("Harlem");
  });

  it("resolves the first matching segment of a slash-combo value", () => {
    expect(findCanonicalNeighborhood("Manhattan", "Harlem / Upper West Side")).toBe("Harlem");
  });

  it("returns null for a neighborhood that belongs to a different borough", () => {
    expect(findCanonicalNeighborhood("Manhattan", "Ditmas Park")).toBeNull();
  });

  it("returns null with no borough", () => {
    expect(findCanonicalNeighborhood(null, "Chelsea")).toBeNull();
  });
});

describe("findCanonicalArea / findCanonicalLANeighborhood (LA)", () => {
  it("matches LA areas and neighborhoods", () => {
    expect(findCanonicalArea("Central LA")).toBe("Central LA");
    expect(findCanonicalLANeighborhood("Central LA", "Hancock Park")).toBe("Hancock Park");
  });

  it("does not cross-match NYC boroughs as LA areas", () => {
    expect(findCanonicalArea("Manhattan")).toBeNull();
  });
});

describe("resolveRegionAndNeighborhood", () => {
  it("resolves an NYC pair", () => {
    expect(resolveRegionAndNeighborhood("Brooklyn", "Ditmas Park")).toEqual({ region: "Brooklyn", neighborhood: "Ditmas Park" });
  });

  it("resolves an LA pair without needing a city field", () => {
    expect(resolveRegionAndNeighborhood("Central LA", "Downtown")).toEqual({ region: "Central LA", neighborhood: "Downtown" });
  });

  it("buckets an unresolvable region as (unresolved) for both fields", () => {
    expect(resolveRegionAndNeighborhood("Manhattan/Brooklyn", "Upper West Side")).toEqual({ region: "(unresolved)", neighborhood: "(unresolved)" });
  });

  it("buckets a resolved region with an unmatched neighborhood as (unresolved) neighborhood only", () => {
    expect(resolveRegionAndNeighborhood("Manhattan", "Nowhereville")).toEqual({ region: "Manhattan", neighborhood: "(unresolved)" });
  });
});

describe("real neighbourhood vs display group (owner directive, 2026-08-08)", () => {
  it("findRealNeighborhood canonicalizes spelling WITHOUT folding to the group", () => {
    // The whole point: these all fold under findCanonicalNeighborhood, and must not fold here.
    expect(findRealNeighborhood("Manhattan", "carnegie hill")).toBe("Carnegie Hill");
    expect(findRealNeighborhood("Manhattan", "East Harlem")).toBe("East Harlem");
    expect(findRealNeighborhood("Manhattan", "sugar hill")).toBe("Sugar Hill");
    expect(findRealNeighborhood("Manhattan", "Yorkville")).toBe("Yorkville");
    expect(findRealNeighborhood("Manhattan", "battery park city")).toBe("Battery Park City");
    expect(findRealNeighborhood("Manhattan", "West Village")).toBe("West Village");
  });

  it("still folds under the grouping rule, so the page is unaffected", () => {
    expect(neighborhoodGroup("Manhattan", "Carnegie Hill")).toBe("Upper East Side");
    expect(neighborhoodGroup("Manhattan", "East Harlem")).toBe("Harlem");
    expect(neighborhoodGroup("Manhattan", "Sugar Hill")).toBe("Harlem");
    expect(neighborhoodGroup("Manhattan", "Battery Park City")).toBe("Financial District");
    expect(neighborhoodGroup("Manhattan", "West Village")).toBe("Greenwich Village");
  });

  it("a neighbourhood that is its own group survives both ways round", () => {
    expect(findRealNeighborhood("Brooklyn", "Gowanus")).toBe("Gowanus");
    expect(neighborhoodGroup("Brooklyn", "Gowanus")).toBe("Gowanus");
  });

  it("REFUSES a compound rather than silently taking its first segment", () => {
    // findCanonicalNeighborhood resolves this to "Harlem", which is right for grouping a legacy value
    // and wrong for deciding what to STORE — a compound usually hides a split candidate.
    expect(findCanonicalNeighborhood("Manhattan", "Harlem / Upper West Side")).toBe("Harlem");
    expect(findRealNeighborhood("Manhattan", "Harlem / Upper West Side")).toBeNull();
  });

  it("does not recognise a place from the wrong borough, or a non-place", () => {
    expect(findRealNeighborhood("Brooklyn", "Carnegie Hill")).toBeNull();
    expect(findRealNeighborhood("Manhattan", "NYC-wide")).toBeNull();
    expect(findRealNeighborhood(null, "Chelsea")).toBeNull();
  });

  it("every added real name has a fold target, so nothing lands outside the page's groups", () => {
    for (const [borough, names] of Object.entries(REAL_NEIGHBORHOODS_EXTRA)) {
      for (const name of names ?? []) {
        const group = neighborhoodGroup(borough as Borough, name);
        expect(group).not.toBeNull();
        expect(NEIGHBORHOODS[borough as Borough]).toContain(group as string);
      }
    }
  });
});
