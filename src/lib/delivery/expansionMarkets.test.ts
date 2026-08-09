import { describe, expect, it } from "vitest";
import {
  ambiguousTowns,
  EXPANSION_MARKETS,
  expansionMarketKeys,
  findExpansionDistrict,
  findExpansionNeighborhood,
  locateTown,
  resolveAnyRegion,
} from "./expansionMarkets";
import {
  findCanonicalArea,
  findCanonicalLANeighborhood,
  findRealNeighborhood,
  LA_AREAS,
  neighborhoodGroup,
  resolveRegionAndNeighborhood,
} from "./locations";

describe("the gaps that retired or mislabelled real listings", () => {
  it("gives Lula Washington Dance Theatre somewhere true to sit — South LA / Crenshaw", () => {
    // Filed under Central LA with an empty neighbourhood, because the vocabulary had no South LA at all.
    expect(findCanonicalArea("South LA")).toBe("South LA");
    expect(findCanonicalLANeighborhood("South LA", "Crenshaw")).toBe("Crenshaw");
  });

  it("resolves the two LA neighbourhoods that blocked live records", () => {
    // Descanso Gardens, 1418 Descanso Drive.
    expect(findCanonicalLANeighborhood("San Gabriel Valley", "La Cañada Flintridge")).toBe("La Cañada Flintridge");
    // Broadway Gymnastics School, 5433 Beethoven Street.
    expect(findCanonicalLANeighborhood("Westside", "Del Rey")).toBe("Del Rey");
  });

  it("resolves the counties that had no value at all, so nothing need be retired for having an address", () => {
    // 92NY Camp Yomi was RETIRED because Rockland County was not expressible.
    expect(findExpansionDistrict("hudson-valley", "Rockland County")).toBe("Rockland County");
    expect(findExpansionNeighborhood("hudson-valley", "Rockland County", "Orangeburg")).toBe("Orangeburg");
    // Three live cards stored the non-borough value "Long Island".
    expect(findExpansionDistrict("long-island", "Suffolk County")).toBe("Suffolk County");
    expect(findExpansionNeighborhood("long-island", "Suffolk County", "Huntington")).toBe("Huntington");
    expect(findExpansionNeighborhood("long-island", "Nassau County", "Garden City")).toBe("Garden City");
    // Confirmed three separate times as a real location with nowhere to go.
    expect(findExpansionNeighborhood("north-jersey", "Bergen County", "Fort Lee")).toBe("Fort Lee");
    expect(findExpansionNeighborhood("southwest-connecticut", "Fairfield County", "New Canaan")).toBe("New Canaan");
  });
});

describe("the additions do not disturb what was already correct", () => {
  it("leaves every ported LA area resolving exactly as before", () => {
    for (const area of LA_AREAS) expect(findCanonicalArea(area)).toBe(area);
  });

  it("leaves NYC resolution untouched, including the real-name/display-group split", () => {
    expect(findRealNeighborhood("Manhattan", "Carnegie Hill")).toBe("Carnegie Hill");
    expect(neighborhoodGroup("Manhattan", "Carnegie Hill")).toBe("Upper East Side");
    expect(findRealNeighborhood("Brooklyn", "Gowanus")).toBe("Gowanus");
  });

  it("adds the NYC neighbourhoods the ported list omitted, and they still group", () => {
    // South Slope is stored on a live Treasure Trunk Theatre record and was not in the vocabulary.
    expect(findRealNeighborhood("Brooklyn", "South Slope")).toBe("South Slope");
    expect(neighborhoodGroup("Brooklyn", "South Slope")).toBeTruthy();
  });
});

describe("locateTown — declines rather than guessing, which matters across state lines", () => {
  it("places an unambiguous town", () => {
    expect(locateTown("Orangeburg")).toEqual({ market: "hudson-valley", district: "Rockland County", town: "Orangeburg" });
    expect(locateTown("Montauk")).toEqual({ market: "long-island", district: "Suffolk County", town: "Montauk" });
  });

  it("REFUSES an ambiguous one — Fairfield is a Connecticut town AND an Essex County, NJ township", () => {
    // A silent pick would put a New Jersey business in Connecticut.
    expect(locateTown("Fairfield")).toBeNull();
    const ambiguous = ambiguousTowns();
    expect(ambiguous).toContain("Fairfield");
    // The collisions are real and worth seeing rather than assuming there are none.
    expect(ambiguous.length).toBeGreaterThan(1);
  });

  it("returns null for a town in no market, rather than the nearest name", () => {
    expect(locateTown("Nowhereville")).toBeNull();
    expect(locateTown("")).toBeNull();
  });
});

describe("resolveAnyRegion — the stats page groups an expansion district instead of discarding it", () => {
  it("passes NYC and LA straight through, unchanged and with no market", () => {
    expect(resolveAnyRegion("Brooklyn", "Ditmas Park", resolveRegionAndNeighborhood)).toEqual({
      region: "Brooklyn", neighborhood: "Ditmas Park", market: null,
    });
    expect(resolveAnyRegion("Central LA", "Downtown", resolveRegionAndNeighborhood)).toEqual({
      region: "Central LA", neighborhood: "Downtown", market: null,
    });
  });

  it("resolves an expansion district and names the market it belongs to", () => {
    expect(resolveAnyRegion("Nassau County", "Garden City", resolveRegionAndNeighborhood)).toEqual({
      region: "Nassau County", neighborhood: "Garden City", market: "long-island",
    });
  });

  it("keeps the district even when the town is unrecognised — a county is still a real answer", () => {
    expect(resolveAnyRegion("Rockland County", "Some Hamlet", resolveRegionAndNeighborhood)).toEqual({
      region: "Rockland County", neighborhood: "(unresolved)", market: "hudson-valley",
    });
  });

  it("still rejects a compound, which is not a place in any vocabulary", () => {
    expect(resolveAnyRegion("Manhattan/Brooklyn", "Upper West Side", resolveRegionAndNeighborhood).region)
      .toBe("(unresolved)");
  });
});

describe("registry integrity", () => {
  it("every market has a key, a label, evidence from a real listing, and at least one district", () => {
    for (const m of EXPANSION_MARKETS) {
      expect(m.key).toMatch(/^[a-z][a-z-]*$/);
      expect(m.label.length).toBeGreaterThan(2);
      // Evidence is required so a market can never be added speculatively.
      expect(m.evidence.length).toBeGreaterThan(40);
      expect(Object.keys(m.districts).length).toBeGreaterThan(0);
      for (const towns of Object.values(m.districts)) expect(towns.length).toBeGreaterThan(0);
    }
    expect(new Set(expansionMarketKeys()).size).toBe(EXPANSION_MARKETS.length);
  });

  it("every district name is a county, which is the one unambiguous administrative unit", () => {
    for (const m of EXPANSION_MARKETS) {
      for (const d of Object.keys(m.districts)) expect(d).toMatch(/County$/);
    }
  });
});
