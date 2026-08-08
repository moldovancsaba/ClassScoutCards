import { describe, expect, it } from "vitest";
import { dimensionOf, isFormatLabel, splitDimensions } from "./activityDimension";

describe("activityDimension", () => {
  describe("the owner-reported case: 'Classes and camps are not activities'", () => {
    it("classifies the canonical four category values as formats, not activities", () => {
      for (const value of ["Classes", "Camps", "Birthday Parties", "Drop-In Activities"]) {
        expect(dimensionOf(value)).toBe("format");
      }
    });

    it("classifies real activities as activities", () => {
      for (const value of ["Soccer", "Art", "Music", "Martial Arts", "STEM", "Swimming", "Lacrosse"]) {
        expect(dimensionOf(value)).toBe("activity");
      }
    });

    it("is case and whitespace tolerant", () => {
      expect(isFormatLabel("  CAMPS  ")).toBe(true);
      expect(isFormatLabel("drop-in activities")).toBe(true);
    });

    it("treats an empty or missing label as neither", () => {
      expect(splitDimensions(null)).toEqual({ activities: [], formats: [] });
      expect(splitDimensions("")).toEqual({ activities: [], formats: [] });
      expect(splitDimensions("   ")).toEqual({ activities: [], formats: [] });
    });
  });

  describe("compound values, which hold both dimensions in one string", () => {
    it("splits 'Sports / Camp' into one of each", () => {
      expect(splitDimensions("Sports / Camp")).toEqual({ activities: ["Sports"], formats: ["Camp"] });
    });

    it("splits 'Preschool / Camp' into two formats and no activity", () => {
      const result = splitDimensions("Preschool / Camp");
      expect(result.activities).toEqual([]);
      expect(result.formats).toEqual(["Preschool", "Camp"]);
    });

    it("keeps both activities when neither part is a format", () => {
      expect(splitDimensions("Baseball / Softball")).toEqual({
        activities: ["Baseball", "Softball"],
        formats: [],
      });
    });

    it("does not lose the sport in a single-word compound like 'Baseball Camp'", () => {
      // The trailing format noun makes this a format, but discarding the leading word would silently
      // drop a real sport from the activity breakdown -- the whole defect this module exists to fix.
      const result = splitDimensions("Baseball Camp");
      expect(result.formats).toEqual(["Baseball Camp"]);
      expect(result.activities).toEqual(["Baseball"]);
    });

    it("does not invent an activity when the remainder is itself a format", () => {
      const result = splitDimensions("Multi-category Camp");
      expect(result.formats).toEqual(["Multi-category Camp"]);
      expect(result.activities).toEqual(["Multi-category"]);
      expect(splitDimensions("School / Camp").activities).toEqual([]);
    });
  });

  describe("format nouns appearing as a suffix", () => {
    it("recognises them without needing every combination enumerated", () => {
      for (const value of ["Sports Camp", "Baseball Camp", "Cooking Classes", "Retail Workshop"]) {
        expect(isFormatLabel(value)).toBe(true);
      }
    });

    it("does not fire on an activity that merely ends in a similar word", () => {
      // Guard against the substring class of bug already recorded for "Art" inside "mARTial".
      expect(isFormatLabel("Circus Arts")).toBe(false);
      expect(isFormatLabel("Martial Arts")).toBe(false);
      expect(isFormatLabel("Arts & Culture")).toBe(false);
    });
  });

  it("every distinct categoryHint value observed live lands in exactly one dimension", () => {
    // Spot sample of the real vocabulary, including the values that motivated the age-dimension note
    // in the module header. The assertion is only that classification is total and deterministic.
    const observed = [
      "Classes", "Drop-In Activities", "Sports", "Family Events", "Soccer", "Art", "Tutoring", "Camps",
      "Dance", "STEM", "Martial Arts", "Indoor Play", "Language", "Music", "Swimming", "Gymnastics",
      "Outdoor Activities", "Birthday Entertainment", "Theater", "Basketball", "Birthday Parties",
      "Parent Groups", "Science", "Preschool / Camp", "Multi-category", "Sports / Camp", "Multi-Sport",
      "Museum", "Meet-Up Groups", "STEM / Science", "Circus Arts", "Chess", "Cooking",
    ];
    for (const value of observed) {
      const { activities, formats } = splitDimensions(value);
      expect(activities.length + formats.length).toBeGreaterThan(0);
      expect(dimensionOf(value)).toMatch(/^(format|activity)$/);
    }
  });
});

describe("regression: a format is not a source of bogus activities", () => {
  it("does not manufacture 'Birthday' out of 'Birthday Parties'", () => {
    // Caught by the activityAlignment suite: stripping the trailing format noun from a value that is
    // ALREADY a known format in its own right invents an activity the label never named.
    expect(splitDimensions("Birthday Parties")).toEqual({ activities: [], formats: ["Birthday Parties"] });
    expect(splitDimensions("Classes")).toEqual({ activities: [], formats: ["Classes"] });
    expect(splitDimensions("Camps")).toEqual({ activities: [], formats: ["Camps"] });
  });

  it("still recovers the activity from a suffix-only format", () => {
    expect(splitDimensions("Baseball Camp").activities).toEqual(["Baseball"]);
    expect(splitDimensions("Cooking Classes").activities).toEqual(["Cooking"]);
  });
});
