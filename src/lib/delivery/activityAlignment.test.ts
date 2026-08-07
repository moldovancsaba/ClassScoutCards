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

  it("clusterFor recognizes every canonical activity label from the main app's own keyword vocabulary", () => {
    for (const activity of ["Sports", "Soccer", "Basketball", "Gymnastics", "Martial Arts", "Swimming", "Yoga", "Dance", "Art", "Music", "Theater", "STEM", "Science", "Language", "Tutoring", "Indoor Play", "Outdoor Activities", "Birthday Entertainment"]) {
      expect(clusterFor(activity)).toBeDefined();
    }
  });
});
