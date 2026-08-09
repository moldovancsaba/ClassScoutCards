import { describe, expect, it } from "vitest";
import { isImgBbHttpsImageUrl, providerPublishGate } from "./publishGate";

/** A listing that a family can actually see. Every test below removes exactly one thing from it. */
const VISIBLE = {
  name: "Gowanus Youth Fencing",
  category: "Classes",
  borough: "Brooklyn",
  neighborhood: "Gowanus",
  website: "https://example.org/gowanus/",
  image: "https://i.ibb.co/abc123/gowanus.jpg",
  shortDescription: "A youth fencing club on Third Avenue with beginner and competitive squads.",
  longDescription: "Foil and epee classes for children from seven upwards, running weekday evenings.",
};

describe("isImgBbHttpsImageUrl — ported from the main app's imgbbUrl.ts", () => {
  it("accepts the hosts the main app accepts", () => {
    for (const url of ["https://i.ibb.co/a/b.jpg", "https://ibb.co/a", "https://image.ibb.co/a/b.png", "https://cdn.ibb.co/x.webp"]) {
      expect(isImgBbHttpsImageUrl(url)).toBe(true);
    }
  });

  it("rejects a SUFFIX COLLISION, which is the whole reason the check is host-based", () => {
    // "ibb.co.evil.example" ends with "ibb.co" as a string but is a completely different host.
    expect(isImgBbHttpsImageUrl("https://ibb.co.evil.example/x.jpg")).toBe(false);
  });

  it("rejects http, a non-imgbb host, and a non-string", () => {
    expect(isImgBbHttpsImageUrl("http://i.ibb.co/a/b.jpg")).toBe(false);
    expect(isImgBbHttpsImageUrl("https://images.example.com/a.jpg")).toBe(false);
    expect(isImgBbHttpsImageUrl(undefined)).toBe(false);
    expect(isImgBbHttpsImageUrl("")).toBe(false);
  });
});

describe("providerPublishGate — would a family see this listing?", () => {
  it("passes a complete listing", () => {
    expect(providerPublishGate(VISIBLE)).toEqual({ ok: true, missing: [] });
  });

  it("reports EVERY unmet requirement, not just the first", () => {
    // A caller fixing a listing wants the whole list; one at a time turns one research pass into five
    // round-trips.
    const r = providerPublishGate({ ...VISIBLE, name: "", category: "", website: "" });
    expect(r.ok).toBe(false);
    expect(r.missing).toHaveLength(3);
  });

  // (2026-08-09, owner directive: "Publish listings even the image missing!!! The core system does not
  // use the images now.") The image was a hard requirement here for exactly one day. Pinned as a test
  // rather than just deleted, because the checked-out classscout code still gates on it and a future
  // reader hitting invisible listings needs to find this decision rather than re-derive it.
  it("no longer requires an image at all", () => {
    const { image, ...noImage } = VISIBLE;
    expect(providerPublishGate(noImage).ok).toBe(true);
    expect(providerPublishGate({ ...VISIBLE, image: "" }).ok).toBe(true);
  });

  it("fails when hidden or quarantined, which are the flags this bridge could always set", () => {
    expect(providerPublishGate({ ...VISIBLE, visibility: "hidden" }).ok).toBe(false);
    expect(providerPublishGate({ ...VISIBLE, qualityStatus: "quarantined" }).ok).toBe(false);
  });

  it("fails on scraped chrome in the copy — a listing can pass every WRITE and still be invisible", () => {
    // The copy gate runs on write; this runs over what is already stored. A record enriched before that
    // gate existed can hold chrome nobody is currently trying to write.
    const r = providerPublishGate({ ...VISIBLE, longDescription: "Skip to main content. Foil and epee classes." });
    expect(r.ok).toBe(false);
    expect(r.missing.join(" ")).toMatch(/scraped page chrome/);
  });

  it("accepts a borough with no neighbourhood — the main app's location label needs only the borough", () => {
    // Worth pinning: an empty neighbourhood is how this loop records an honest absence, and that must
    // not silently make a listing invisible.
    expect(providerPublishGate({ ...VISIBLE, neighborhood: "" }).ok).toBe(true);
  });

  it("does NOT require phone, email, address, ageRanges, schedule, price — or an image", () => {
    // Each of those is a quality obligation under the enrichment mandate, not a visibility condition.
    // Conflating the two would make this gate refuse listings the main app would happily show.
    expect(providerPublishGate(VISIBLE).ok).toBe(true);
  });

  it("does NOT read publishedAt, which is a SORT KEY and not the gate", () => {
    // The stats page reports a "published" count from publishedAt and it differs from the visible count
    // by hundreds of records. Reintroducing it here would be the single easiest way to break this.
    expect(providerPublishGate({ ...VISIBLE, publishedAt: null } as never).ok).toBe(true);
  });

  it("falls back to sourceUrls[0] when website is absent", () => {
    const { website, ...noWebsite } = VISIBLE;
    expect(providerPublishGate({ ...noWebsite, sourceUrls: [website] }).ok).toBe(true);
    expect(providerPublishGate({ ...noWebsite, sourceUrls: [] }).ok).toBe(false);
  });
});
