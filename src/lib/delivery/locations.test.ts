import { describe, expect, it } from "vitest";
import {
  findCanonicalArea,
  findCanonicalBorough,
  findCanonicalLANeighborhood,
  findCanonicalNeighborhood,
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
