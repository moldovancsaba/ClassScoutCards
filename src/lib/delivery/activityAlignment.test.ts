import { describe, expect, it } from "vitest";
import { alignActivityTypes, clusterFor } from "./activityAlignment";

describe("alignActivityTypes", () => {
  it("the owner-reported case: Music, Basketball, Sport, Soccer, Handball -> keeps Basketball, Sport, Soccer", () => {
    const result = alignActivityTypes({
      activityTypes: ["Music", "Basketball", "Sports", "Soccer", "Handball"],
      title: "Basketball School",
    });
    expect(result.primaryActivityType).toBe("Basketball");
    expect(result.activityTypes).toEqual(["Basketball", "Sports", "Soccer"]);
    expect(result.dropped).toContain("Music");
    expect(result.dropped).toContain("Handball");
  });

  it("trusts a valid primaryActivityType over a title guess", () => {
    const result = alignActivityTypes({
      activityTypes: ["Art", "Basketball"],
      primaryActivityType: "Basketball",
      title: "Brooklyn Nets Basketball Academy",
    });
    expect(result.primaryActivityType).toBe("Basketball");
    expect(result.activityTypes).toEqual(["Basketball"]);
    expect(result.dropped).toEqual(["Art"]);
  });

  it("ignores a stale primaryActivityType that is no longer in activityTypes", () => {
    const result = alignActivityTypes({
      activityTypes: ["Soccer", "Sports"],
      primaryActivityType: "Music",
      title: "Downtown Soccer Club",
    });
    expect(result.primaryActivityType).toBe("Soccer");
  });

  it("falls back to the first candidate when no title or primaryActivityType is available", () => {
    const result = alignActivityTypes({ activityTypes: ["Dance", "Music"] });
    expect(result.primaryActivityType).toBe("Dance");
    expect(result.activityTypes).toEqual(["Dance", "Music"]);
  });

  it("returns an empty result for an empty candidate list", () => {
    const result = alignActivityTypes({ activityTypes: [] });
    expect(result.primaryActivityType).toBeUndefined();
    expect(result.activityTypes).toEqual([]);
    expect(result.dropped).toEqual([]);
  });

  it("preserves original order (capped at 3) for an unrecognized/custom primary activity label", () => {
    const result = alignActivityTypes({
      activityTypes: ["Custom Enrichment Tag", "Music", "Art", "Soccer"],
      title: "Custom Enrichment Tag Studio",
    });
    expect(result.primaryActivityType).toBe("Custom Enrichment Tag");
    expect(result.activityTypes).toEqual(["Custom Enrichment Tag", "Music", "Art"]);
  });

  it("deduplicates candidates before aligning", () => {
    const result = alignActivityTypes({ activityTypes: ["Soccer", "Soccer", "Sports"], title: "Soccer Club" });
    expect(result.activityTypes).toEqual(["Soccer", "Sports"]);
  });

  it("keeps only same-cluster activities even when there are more than 3 sports-family candidates", () => {
    const result = alignActivityTypes({
      activityTypes: ["Basketball", "Soccer", "Sports", "Swimming", "Yoga"],
      title: "Multi-Sport Academy",
    });
    expect(result.activityTypes).toHaveLength(3);
    expect(result.activityTypes.every((activity) => clusterFor(activity) === "sportsAndFitness")).toBe(true);
  });

  describe("the ingestion 'no category' placeholder (owner-reported 2026-08-07, live on real cards)", () => {
    it("never survives into activityTypes, and never becomes the primary", () => {
      const result = alignActivityTypes({
        activityTypes: ["no category", "Art", "Music", "Swimming"],
        title: "Take Me to the Water",
      });
      expect(result.activityTypes).not.toContain("no category");
      expect(result.primaryActivityType).not.toBe("no category");
      expect(result.dropped).toContain("no category");
    });

    it("the real polluted row that exposed this resolves to the activity the listing is actually about", () => {
      // Before the placeholder strip this returned primary "no category" and DROPPED "Swimming".
      // Stripping alone then fell through to scan order and picked "Art" -- still wrong for a swim
      // school. The ported title-keyword patterns ("water" -> Swimming) get it right.
      const result = alignActivityTypes({
        activityTypes: ["no category", "Art", "Music", "Swimming"],
        title: "Take Me to the Water",
      });
      expect(result.primaryActivityType).toBe("Swimming");
      expect(result.activityTypes).not.toContain("no category");
    });

    it("a jiu jitsu academy resolves to Martial Arts, not whatever sorted first", () => {
      const result = alignActivityTypes({
        activityTypes: ["no category", "Art", "Music", "Martial Arts", "Outdoor Activities"],
        title: "Park Slope Academy Jiu Jitsu Kids",
      });
      expect(result.primaryActivityType).toBe("Martial Arts");
    });

    it("a specific sport in the title outranks the generic Sports bucket", () => {
      const result = alignActivityTypes({
        activityTypes: ["Sports", "Swimming", "Art"],
        title: "Brooklyn Aquatic Center",
      });
      expect(result.primaryActivityType).toBe("Swimming");
    });

    it("title keywords never invent a tag the listing does not already carry", () => {
      const result = alignActivityTypes({ activityTypes: ["Art", "Music"], title: "Downtown Swim Academy" });
      expect(result.activityTypes).not.toContain("Swimming");
      expect(result.primaryActivityType).toBe("Art");
    });

    it("strips a stored primaryActivityType that is itself the placeholder", () => {
      const result = alignActivityTypes({
        activityTypes: ["no category", "Soccer", "Sports"],
        primaryActivityType: "no category",
        title: "Brooklyn Soccer Club",
      });
      expect(result.primaryActivityType).toBe("Soccer");
      expect(result.activityTypes).toEqual(["Soccer", "Sports"]);
    });

    it("matches the real Aviator Sports Gymnastics row from the owner's screenshot", () => {
      const result = alignActivityTypes({
        activityTypes: ["Gymnastics", "Sports", "Outdoor Activities", "Soccer", "Basketball", "no category", "Art", "Music"],
        title: "Aviator Sports Gymnastics",
      });
      expect(result.activityTypes).toEqual(["Gymnastics", "Sports", "Soccer"]);
      expect(result.activityTypes).not.toContain("no category");
    });

    it("is case/whitespace tolerant", () => {
      const result = alignActivityTypes({ activityTypes: ["  No Category  ", "Soccer"], title: "Soccer Club" });
      expect(result.activityTypes).toEqual(["Soccer"]);
    });

    it("returns an empty result when the placeholder was the ONLY entry", () => {
      const result = alignActivityTypes({ activityTypes: ["no category"], title: "Something" });
      expect(result.activityTypes).toEqual([]);
      expect(result.primaryActivityType).toBeUndefined();
      expect(result.dropped).toContain("no category");
    });
  });

  it("clusterFor recognizes every canonical activity label from the main app's own keyword vocabulary", () => {
    for (const activity of ["Sports", "Soccer", "Basketball", "Gymnastics", "Martial Arts", "Swimming", "Yoga", "Dance", "Art", "Music", "Theater", "STEM", "Science", "Language", "Tutoring", "Indoor Play", "Outdoor Activities", "Birthday Entertainment"]) {
      expect(clusterFor(activity)).toBeDefined();
    }
  });
});
