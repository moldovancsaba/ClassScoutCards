import { describe, expect, it } from "vitest";
import { providerSignals, rankProviders, sharedImages } from "./providerSignals";

describe("signals learned by hand-working batch 1 (2026-08-09), each now measurable pool-wide", () => {
  it("catches the byte-identical generic description — American Youth Dance Theater", () => {
    const filler = "American Youth Dance Theater offers dance classes for children and teens in Manhattan's Upper East Side.";
    const s = providerSignals({ shortDescription: filler, longDescription: filler });
    expect(s).toContain("desc_identical");
    expect(s).toContain("desc_tiny");
  });

  it("catches copy scraped from the wrong site in another language — Kids in Sports UES", () => {
    // Stored website was youtubekids.com, so BOTH descriptions were this.
    const s = providerSignals({
      shortDescription: "YouTube Kids A YouTube Kids alkalmazás használatához kérd meg valamelyik szülődet.",
    });
    expect(s).toContain("desc_not_english");
  });

  it("distinguishes a placeholder address from a real one and from an absent one", () => {
    expect(providerSignals({ address: "Upper East Side, Manhattan, NYC" })).toContain("addr_placeholder");
    expect(providerSignals({ address: "1420 Second Avenue, New York, NY 10021" })).not.toContain("addr_placeholder");
    expect(providerSignals({ address: "" })).toContain("addr_missing");
  });

  it("a fully populated record trips nothing — only 145 of 1,040 live records manage it", () => {
    expect(
      providerSignals({
        shortDescription: "x".repeat(200),
        longDescription: "y".repeat(400),
        address: "62 Tillary Street, Brooklyn, NY 11201",
        phone: "718-285-0389",
        email: "dnalc-camps@cshl.edu",
        website: "https://summercamps.dnalc.org/",
        image: "https://example.test/a.jpg",
        neighborhood: "Downtown Brooklyn",
        primaryActivityType: "Science",
        activityTypes: ["Science"],
        ageRanges: ["9–12", "Teens"],
      }),
    ).toEqual([]);
  });
});

describe("sharedImages — a signal no single record can reveal about itself", () => {
  it("flags a stock banner used by unrelated providers, not a genuinely unique photo", () => {
    const rows = [
      { id: "a", image: "https://i.ibb.co/x/csny-banner-dance.png" },
      { id: "b", image: "https://i.ibb.co/x/csny-banner-dance.png" },
      { id: "c", image: "https://i.ibb.co/y/real-studio-photo.jpg" },
    ];
    const shared = sharedImages(rows);
    expect(shared.get("https://i.ibb.co/x/csny-banner-dance.png")).toBe(2);
    expect(shared.has("https://i.ibb.co/y/real-studio-photo.jpg")).toBe(false);
  });
});

describe("rankProviders — the queue that replaced sorting by updatedAt", () => {
  it("orders worst-first and attaches the pool-level image signal", () => {
    const rows = [
      { id: "clean", name: "Clean", shortDescription: "x".repeat(200), longDescription: "y".repeat(300),
        address: "1 Real St, New York, NY 10001", phone: "212-555-0100", email: "a@b.test",
        website: "https://b.test", image: "https://img.test/unique.jpg", neighborhood: "Chelsea",
        primaryActivityType: "Dance", activityTypes: ["Dance"], ageRanges: ["6–8"] },
      { id: "bad", name: "Bad", shortDescription: "tiny", longDescription: "tiny",
        address: "Chelsea, Manhattan, NYC", image: "https://img.test/stock.png" },
      { id: "alsostock", name: "Also", shortDescription: "x".repeat(200), longDescription: "y".repeat(300),
        address: "2 Real St, New York, NY 10001", phone: "212-555-0101", email: "c@d.test",
        website: "https://d.test", image: "https://img.test/stock.png", neighborhood: "Chelsea",
        primaryActivityType: "Dance", activityTypes: ["Dance"], ageRanges: ["6–8"] },
    ];
    const ranked = rankProviders(rows);
    expect(ranked[0].id).toBe("bad");
    expect(ranked.map((r) => r.id)).not.toContain("clean");
    // The otherwise-perfect record still surfaces, on the one signal it cannot see about itself.
    expect(ranked.find((r) => r.id === "alsostock")?.signals).toEqual(["image_shared"]);
  });

  it("honours the worked set — without it the loop re-serves what it just fixed", () => {
    // Fixing a record rarely clears every signal: an operator who publishes no email still trips
    // email_missing after a perfect review, so signal count alone cannot retire a record from the queue.
    const rows = [{ id: "done", name: "Done", shortDescription: "tiny" }];
    expect(rankProviders(rows)).toHaveLength(1);
    expect(rankProviders(rows, new Set(["done"]))).toHaveLength(0);
  });
});
