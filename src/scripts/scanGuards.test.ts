import { describe, expect, it } from "vitest";
import {
  addressNamesPlace,
  hostMatches,
  isDeliveryModelAddress,
  isDialablePhone,
  isPlausibleNanpPhone,
  matchesWholeWord,
  placesNamedInAddress,
  repeatedValues,
  requireSample,
} from "./scanGuards";

describe("the four false positives this module exists to prevent (all 2026-08-08, all in one pass)", () => {
  it("`ebay` does not match inside `healthebay.org` — and a denylist entry must be a FULL domain", () => {
    expect(hostMatches("healthebay.org", "ebay")).toBe(false);
    expect(hostMatches("notyelp.com", "yelp")).toBe(false);
    // A bare label is not a domain, so it matches nothing. That is the point: writing "ebay" in a
    // denylist is the bug, and this makes it fail loudly rather than match "healthebay" quietly.
    expect(hostMatches("www.ebay.com", "ebay")).toBe(false);
    expect(hostMatches("www.ebay.com", "ebay.com")).toBe(true);
    expect(hostMatches("cgi.ebay.com", "ebay.com")).toBe(true);
    expect(hostMatches("ebay.com", "ebay.com")).toBe(true);
  });

  it("`Art` does not match inside `Martial Arts`", () => {
    expect(matchesWholeWord("Brooklyn Martial Arts Academy", "art")).toBe(false);
    expect(matchesWholeWord("The Art Studio NY", "art")).toBe(true);
  });

  it("`Richmond` does not match inside `1000 Richmond Terrace`", () => {
    // The exact case that would have filed six Staten Island museums in Richmondtown.
    expect(addressNamesPlace("1000 Richmond Terrace, Staten Island, NY 10301", "Richmond")).toBe(false);
    expect(addressNamesPlace("26 Richmond Valley Rd, Staten Island, NY 10309", "Richmond")).toBe(false);
    expect(addressNamesPlace("43-44 12th Street, Long Island City, NY 11101", "Long Island City")).toBe(true);
  });

  it("a phone whose area code cannot exist is rejected", () => {
    // Both were produced by scraping page text: one appeared on two unrelated providers.
    expect(isPlausibleNanpPhone("259-891-1325")).toBe(true); // 259 IS structurally valid — see note below
    expect(isPlausibleNanpPhone("594-475-4911")).toBe(true);
    expect(isPlausibleNanpPhone("999-999-9999")).toBe(false);
    expect(isPlausibleNanpPhone("012-345-6789")).toBe(false);
    expect(isPlausibleNanpPhone("212-1234-567")).toBe(false);
    expect(isPlausibleNanpPhone("212-569-6200 ext. 2274")).toBe(true);
    expect(isPlausibleNanpPhone("1742850639")).toBe(false); // a Unix timestamp, found live
  });
});

describe("structural validity is necessary but NOT sufficient", () => {
  it("is why repeatedValues exists — a structurally fine number on two unrelated records is a scrape", () => {
    // 259-891-1325 passes NANP structure. What condemned it was appearing on two different providers.
    const rows = [
      { id: "brooklyn-basketball", phone: "259-891-1325" },
      { id: "coney-island-gymnastics", phone: "259-891-1325" },
      { id: "harlem-grown", phone: "212-870-0113" },
    ];
    const distrust = repeatedValues(rows, (r) => r.phone);
    expect(distrust.has("259-891-1325")).toBe(true);
    expect(distrust.has("212-870-0113")).toBe(false);
  });

  it("catches one website shared by unrelated operators, and one paragraph used as two descriptions", () => {
    expect(repeatedValues(
      [{ w: "lax.com" }, { w: "lax.com" }, { w: "riverdale.org" }],
      (r) => r.w,
    )).toEqual(new Set(["lax.com"]));
  });
});

describe("addresses naming more than one place are SPLIT candidates, not a value to pick from", () => {
  it("returns every named place, so more than one is visible to the caller", () => {
    const vocab = ["Fort Greene", "Park Slope", "Cobble Hill", "Gowanus"];
    expect(placesNamedInAddress("Fort Greene, Park Slope, Cobble Hill", vocab))
      .toEqual(["Fort Greene", "Park Slope", "Cobble Hill"]);
    expect(placesNamedInAddress("98 4th St, Gowanus, NY 11231", vocab)).toEqual(["Gowanus"]);
  });

  it("component matching ALONE does not catch a prose multi-location list — and that is why the sweep needs a second check", () => {
    // The real stored value. "Park Slope and Cobble Hill locations" is one comma component, so only
    // Fort Greene matches and the record looks single-location. The live sweep therefore also rejects
    // any address containing " and " or "locations". Recorded here so the gap is not rediscovered.
    const vocab = ["Fort Greene", "Park Slope", "Cobble Hill"];
    const addr = "Fort Greene, Park Slope and Cobble Hill locations";
    expect(placesNamedInAddress(addr, vocab)).toEqual(["Fort Greene"]);
    expect(/\band\b|locations/i.test(addr)).toBe(true);
  });
});

describe("requireSample — the guard against trusting a count", () => {
  it("renders a sample of the matches and returns them", () => {
    const lines: string[] = [];
    const out = requireSample([{ n: "a" }, { n: "b" }], {
      label: "test scan",
      render: (i) => i.n,
      sink: (l) => lines.push(l),
    });
    expect(out).toHaveLength(2);
    expect(lines[0]).toContain("2 match(es)");
    expect(lines.join("\n")).toContain("a");
  });

  it("states a zero explicitly rather than passing silently", () => {
    const lines: string[] = [];
    requireSample([], { label: "empty scan", render: String, sink: (l) => lines.push(l) });
    expect(lines.join("\n")).toMatch(/nothing matched/);
  });

  it("caps the sample, because rendering fifty rows defeats the purpose of reading them", () => {
    const lines: string[] = [];
    requireSample(Array.from({ length: 40 }, (_, i) => i), {
      label: "big scan", render: String, sink: (l) => lines.push(l),
    });
    expect(lines.filter((l) => /^\[sample]\s{3}\d/.test(l))).toHaveLength(5);
    expect(lines.join("\n")).toContain("and 35 more");
  });

  it("refuses a caller that supplies no render function", () => {
    // @ts-expect-error deliberately omitting the required render
    expect(() => requireSample([1], { label: "x" })).toThrow(/render function is required/);
  });
});

describe("structural validity is not dialability (batch 3, 2026-08-09)", () => {
  it("rejects area codes that pass every shape rule but do not exist", () => {
    // Both were live on real listings. 238 has never been assigned; 822 is reserved toll-free and
    // cannot be geographic. The shape check passes both, which is exactly the point.
    expect(isPlausibleNanpPhone("238-629-9338")).toBe(true);
    expect(isDialablePhone("238-629-9338")).toBe(false);
    expect(isPlausibleNanpPhone("822-897-7945")).toBe(true);
    expect(isDialablePhone("822-897-7945")).toBe(false);
  });

  it("keeps real numbers, including a genuine out-of-area hotline and an extension", () => {
    expect(isDialablePhone("212-744-4900")).toBe(true);
    expect(isDialablePhone("718-387-2071")).toBe(true);
    // Doc's NYC Lacrosse publishes a Boston-area hotline on its own front page. Non-local is not wrong.
    expect(isDialablePhone("617-555-0134")).toBe(true);
    expect(isDialablePhone("212-569-6200 ext. 2274")).toBe(true);
    expect(isDialablePhone("1-800-555-0100")).toBe(true);
  });
});

describe("a delivery model is not an address", () => {
  it("separates how a programme is delivered from where a child goes", () => {
    expect(isDeliveryModelAddress("Multiple Brooklyn locations")).toBe(true);
    expect(isDeliveryModelAddress("94 NYCHA community centres citywide")).toBe(true);
    expect(isDeliveryModelAddress("Touring -- various NYC venues (Lincoln Center, NYPL)")).toBe(true);
    expect(isDeliveryModelAddress("850 62nd Street, Brooklyn, NY 11220")).toBe(false);
    // A placeholder is a different defect: it names one real neighbourhood, however coarsely.
    expect(isDeliveryModelAddress("Gowanus, Brooklyn, NYC")).toBe(false);
  });
});
