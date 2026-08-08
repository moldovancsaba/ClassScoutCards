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
    // The parent is ADDED even though the source never carried it -- every sport listing gets it.
    expect(result.activityTypes).toEqual(["Basketball", "Sports"]);
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
      activityTypes: ["Custom Enrichment Tag", "Music", "Art", "Theater"],
      title: "Custom Enrichment Tag Studio",
    });
    expect(result.primaryActivityType).toBe("Custom Enrichment Tag");
    expect(result.activityTypes).toEqual(["Custom Enrichment Tag", "Music", "Art"]);
  });

  it("a sport anywhere in the list outranks even a custom label the title names exactly", () => {
    // Same input as above with one sport added. The sport-dominant rule is checked BEFORE the
    // title match, so the custom tag loses -- that is the point of the rule, not a side effect.
    const result = alignActivityTypes({
      activityTypes: ["Custom Enrichment Tag", "Music", "Art", "Soccer"],
      title: "Custom Enrichment Tag Studio",
    });
    expect(result.activityTypes).toEqual(["Soccer", "Sports"]);
    expect(result.dropped).toContain("Custom Enrichment Tag");
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
      expect(result.activityTypes).toEqual(["Soccer", "Sports"]);
    });

    it("returns an empty result when the placeholder was the ONLY entry", () => {
      const result = alignActivityTypes({ activityTypes: ["no category"], title: "Something" });
      expect(result.activityTypes).toEqual([]);
      expect(result.primaryActivityType).toBeUndefined();
      expect(result.dropped).toContain("no category");
    });
  });

  describe("a candidate label buried inside a longer word (found in PR review, 2026-08-08)", () => {
    it("does not let 'Art' inside 'mARTial' beat the real 'Martial Arts' tag", () => {
      // The exact reported case: a bare `includes` finds "art" inside "martial", and returning the
      // FIRST matching candidate in discovery-scan order then picks Art -- which, being in a different
      // cluster, also drops the real Martial Arts tag. Both halves are asserted below.
      const result = alignActivityTypes({
        activityTypes: ["Art", "Martial Arts", "Sports"],
        title: "Brooklyn Martial Arts Academy",
      });
      expect(result.primaryActivityType).toBe("Martial Arts");
      expect(result.activityTypes).toContain("Martial Arts");
      expect(result.activityTypes[0]).toBe("Martial Arts");
    });

    it("is not order-dependent -- the same title wins whichever way the candidates are listed", () => {
      const forwards = alignActivityTypes({ activityTypes: ["Art", "Martial Arts"], title: "Brooklyn Martial Arts Academy" });
      const backwards = alignActivityTypes({ activityTypes: ["Martial Arts", "Art"], title: "Brooklyn Martial Arts Academy" });
      expect(forwards.primaryActivityType).toBe("Martial Arts");
      expect(backwards.primaryActivityType).toBe("Martial Arts");
    });

    it("still matches a label the title really does name", () => {
      expect(alignActivityTypes({ activityTypes: ["Art", "Music"], title: "The Art Studio NY" }).primaryActivityType).toBe("Art");
      expect(alignActivityTypes({ activityTypes: ["Music", "Art"], title: "Brooklyn Music Factory" }).primaryActivityType).toBe("Music");
    });

    it("prefers the longest label the title names, not the first one", () => {
      // "Swimming" is named too, but "Swimming Lessons" is the more specific thing the title says.
      const result = alignActivityTypes({
        activityTypes: ["Swimming", "Swimming Lessons"],
        title: "Gowanus Swimming Lessons for Kids",
      });
      expect(result.primaryActivityType).toBe("Swimming Lessons");
    });

    it("keyword fallback still resolves 'Park Slope' to the activity, not the place", () => {
      // Regression guard: sorting the KEYWORD matches by label length (as opposed to the literal
      // matches in step 1) makes "Outdoor Activities" beat "Martial Arts" here, because the pattern
      // for Outdoor Activities fires on the word "Park" in the neighbourhood name.
      const result = alignActivityTypes({
        activityTypes: ["Outdoor Activities", "Martial Arts"],
        title: "Park Slope Academy Jiu Jitsu Kids",
      });
      expect(result.primaryActivityType).toBe("Martial Arts");
    });
  });

  describe("the Sports parent taxonomy (owner directive, 2026-08-08)", () => {
    it("the exact card the owner sent: 'start with yoga than comes the sport'", () => {
      // Screenshot of a live card, "Movement Gowanus Youth Programs", whose chips read
      // SPORTS, YOGA -- the parent first and the discipline second, which is backwards, plus four
      // unrelated tags. Both faults are asserted here because they were reported together.
      const result = alignActivityTypes({
        activityTypes: ["Sports", "Yoga", "Art", "Music", "Outdoor Activities", "Birthday Entertainment"],
        title: "Movement Gowanus Youth Programs",
      });
      expect(result.activityTypes).toEqual(["Yoga", "Sports"]);
      expect(result.primaryActivityType).toBe("Yoga");
    });

    it("the specific sport always leads and the parent always sits second", () => {
      for (const sport of ["Lacrosse", "Soccer", "Baseball", "Fencing"]) {
        const result = alignActivityTypes({ activityTypes: [sport], title: `${sport} Academy` });
        expect(result.activityTypes).toEqual([sport, "Sports"]);
        expect(result.primaryActivityType).toBe(sport);
      }
    });

    it("adds the parent even when the source listing never carried it", () => {
      const result = alignActivityTypes({ activityTypes: ["Lacrosse"], title: "Brooklyn Lacrosse Club" });
      expect(result.activityTypes).toEqual(["Lacrosse", "Sports"]);
    });

    it("retires 'Multi-Sport' onto the parent rather than keeping it as a sport in its own right", () => {
      const result = alignActivityTypes({ activityTypes: ["Multi-Sport"], title: "Kids in the Game" });
      expect(result.activityTypes).toEqual(["Sports"]);
      expect(result.primaryActivityType).toBe("Sports");
    });

    it("collapses Multi-Sport and Sports together instead of listing one concept twice", () => {
      const result = alignActivityTypes({
        activityTypes: ["Multi-Sport", "Sports", "Soccer"],
        title: "Downtown Soccer Club",
      });
      expect(result.activityTypes).toEqual(["Soccer", "Sports"]);
    });

    it("leaves the bare parent when the listing names no specific sport", () => {
      const result = alignActivityTypes({ activityTypes: ["Sports", "Art"], title: "Aviator Sports Complex" });
      expect(result.activityTypes).toEqual(["Sports"]);
      expect(result.dropped).toContain("Art");
    });

    it("caps at 3, so at most two specific sports survive alongside the parent", () => {
      const result = alignActivityTypes({
        activityTypes: ["Soccer", "Basketball", "Baseball", "Tennis"],
        title: "Chelsea Piers Soccer",
      });
      expect(result.activityTypes).toEqual(["Soccer", "Sports", "Basketball"]);
      expect(result.dropped).toEqual(expect.arrayContaining(["Baseball", "Tennis"]));
    });
  });

  describe("activityTypes holds activities only -- no formats, no pipeline jargon", () => {
    it("the owner-reported Kinder Prep Montessori card: a 100% sport listing led by a technical leak", () => {
      // Live card, owner screenshot. Chips read PRESCHOOL / MULTI-ENRICHMENT, DANCE, GYMNASTICS --
      // the lead chip being, in the owner's words, "a technical leak, not something informal for a
      // parent". Gymnastics is the activity, so the card should read Gymnastics first, Sports second.
      const result = alignActivityTypes({
        activityTypes: ["Preschool / Multi-enrichment", "Dance", "Gymnastics"],
        title: "Kinder Prep Montessori",
      });
      expect(result.activityTypes).toEqual(["Gymnastics", "Sports"]);
      expect(result.primaryActivityType).toBe("Gymnastics");
      expect(result.dropped).toContain("Preschool / Multi-enrichment");
      expect(result.dropped).toContain("Dance");
    });

    it("drops format values, which belong to the category field and its own badge", () => {
      for (const format of ["Camps", "Classes", "Birthday Parties", "Drop-In Activities"]) {
        const result = alignActivityTypes({ activityTypes: [format, "Art"], title: "Studio" });
        expect(result.activityTypes).toEqual(["Art"]);
        expect(result.dropped).toContain(format);
      }
    });

    it("leaves the field empty rather than showing a format as though it were an activity", () => {
      const result = alignActivityTypes({ activityTypes: ["Camps"], title: "Summer Program" });
      expect(result.activityTypes).toEqual([]);
      expect(result.primaryActivityType).toBeUndefined();
    });

    it("drops non-answers that record the pipeline's failure to classify", () => {
      for (const jargon of ["Multi-category", "Multi-enrichment", "Multi-Activity"]) {
        const result = alignActivityTypes({ activityTypes: [jargon, "Music"], title: "Studio" });
        expect(result.activityTypes).toEqual(["Music"]);
        expect(result.dropped).toContain(jargon);
      }
    });

    it("splits a compound into its parts instead of storing one uninformative string", () => {
      const result = alignActivityTypes({ activityTypes: ["Baseball / Softball"], title: "Little League" });
      expect(result.activityTypes).toEqual(["Baseball", "Sports", "Softball"]);
    });

    it("keeps the activity out of a compound whose other half is a format", () => {
      expect(alignActivityTypes({ activityTypes: ["Sports / Camp"], title: "x" }).activityTypes).toEqual(["Sports"]);
      expect(alignActivityTypes({ activityTypes: ["Baseball Camp"], title: "x" }).activityTypes).toEqual([
        "Baseball",
        "Sports",
      ]);
    });

    it("collapses every 'sport, unspecified' spelling onto the parent", () => {
      for (const generic of ["Multi-Sport", "Various Sports", "Team Sports", "Multi-Sport Camp"]) {
        expect(alignActivityTypes({ activityTypes: [generic], title: "x" }).activityTypes).toEqual(["Sports"]);
      }
    });
  });

  describe("the sport-dominant rule (owner directive, 2026-08-08)", () => {
    it("drops music, art and STEM outright when any sport is present", () => {
      const result = alignActivityTypes({
        activityTypes: ["Music", "Art", "STEM", "Science", "Swimming"],
        title: "Asphalt Green",
      });
      expect(result.activityTypes).toEqual(["Swimming", "Sports"]);
      expect(result.dropped).toEqual(expect.arrayContaining(["Music", "Art", "STEM", "Science"]));
    });

    it("leaves a listing with no sport at all to the pre-existing cluster rule", () => {
      // STEM is dropped here by the ORIGINAL same-cluster rule (academicAndSTEM vs artsAndPerformance),
      // not by anything the sport work added -- asserted so a future change to the sport branch that
      // accidentally starts touching non-sport listings shows up as a failure here.
      const result = alignActivityTypes({
        activityTypes: ["Music", "Art", "Theater", "STEM"],
        title: "Brooklyn Music Factory",
      });
      expect(result.activityTypes).toEqual(["Music", "Art", "Theater"]);
      expect(result.primaryActivityType).toBe("Music");
      expect(result.activityTypes).not.toContain("Sports");
    });

    it("does not delete a real sport whose exact spelling is missing from the vocabulary", () => {
      // The hazard the containment match exists for: under a rule that drops every non-sport tag,
      // failing to RECOGNISE a sport means DELETING it. "Swimming Lessons" is the case that caught it.
      const result = alignActivityTypes({
        activityTypes: ["Swimming Lessons", "Music"],
        title: "Take Me to the Water",
      });
      expect(result.activityTypes).toContain("Swimming Lessons");
      expect(result.dropped).toContain("Music");
    });

    it("a sport in a different cluster is still kept -- the rule is sport-vs-not, not cluster matching", () => {
      // Yoga clusters with sportsAndFitness, but the guard that matters is that a discipline the
      // cluster map might file elsewhere is not silently dropped from a sport listing.
      const result = alignActivityTypes({
        activityTypes: ["Soccer", "Yoga", "Dance"],
        title: "Brooklyn Soccer Club",
      });
      expect(result.activityTypes).toEqual(["Soccer", "Sports", "Yoga"]);
      expect(result.dropped).toContain("Dance");
    });
  });

  it("clusterFor recognizes every canonical activity label from the main app's own keyword vocabulary", () => {
    for (const activity of ["Sports", "Soccer", "Basketball", "Gymnastics", "Martial Arts", "Swimming", "Yoga", "Dance", "Art", "Music", "Theater", "STEM", "Science", "Language", "Tutoring", "Indoor Play", "Outdoor Activities", "Birthday Entertainment"]) {
      expect(clusterFor(activity)).toBeDefined();
    }
  });
});
