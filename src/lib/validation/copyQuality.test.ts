import { describe, expect, it } from "vitest";
import { validateCopyQuality } from "./copyQuality";

describe("validateCopyQuality", () => {
  it("passes clean, real prose", () => {
    expect(validateCopyQuality("A welcoming after-school dance program in Park Slope for ages 3-8.", "shortDescription")).toBeNull();
  });

  it("rejects a URL or Sources line", () => {
    expect(validateCopyQuality("Great classes. Visit https://example.com for info.", "d")).toMatch(/URLs/);
    expect(validateCopyQuality("Great classes. Sources: https://example.com", "d")).toMatch(/URLs/);
  });

  it("rejects scraped navigation/form chrome", () => {
    expect(validateCopyQuality("Skip to main content. Welcome!", "d")).toMatch(/scraped/);
    expect(validateCopyQuality("Zip Code (required) for signup", "d")).toMatch(/scraped/);
  });

  it("rejects carousel dot-indicator artifacts", () => {
    expect(validateCopyQuality("Welcome to our program. • • • •", "d")).toMatch(/scraped/);
  });

  it("does not false-positive on a legitimate space-separated age range", () => {
    expect(validateCopyQuality("A welcoming after-school program for ages 3 4 5 6 accepted here today.", "d")).toBeNull();
  });

  it("rejects generic placeholder copy", () => {
    expect(validateCopyQuality("This is a default short description for NYC families.", "d")).toMatch(/placeholder/);
  });

  it("rejects un-decoded HTML entities", () => {
    expect(validateCopyQuality("We celebrate 32&nbsp;years of service to families.", "d")).toMatch(/HTML entities/);
  });

  it("rejects copy that's too short to be real prose", () => {
    expect(validateCopyQuality("Classes here.", "d")).toMatch(/too short/);
  });
});

// (2026-08-09, owner directive) US English in family-facing copy. The word list is the easy half; the
// protection against renaming a real business is the half worth testing.
describe("British spelling in public copy", () => {
  it("rejects the spellings the sweep actually found in live records", () => {
    for (const [text, word] of [
      ["Our after-school programme runs weekly for ages five and up in the gym.", "programme"],
      ["A community centre with a pool, open to families across the area.", "centre"],
      ["A neighbourhood club that has run here for over thirty years now.", "neighbourhood"],
      ["The organisation runs camps and classes throughout the school year.", "organisation"],
      ["Coaches travelling between sites teach the same graded curriculum.", "travelling"],
      ["Self-defence classes for children from about six years upwards.", "defence"],
    ] as const) {
      const err = validateCopyQuality(text, "longDescription");
      expect(err, text).toBeTruthy();
      expect(err).toContain(word);
    }
  });

  it("NEVER flags a capitalised Theatre — that is a real business's name", () => {
    // Treasure Trunk Theatre, American Ballet Theatre, Dance Theatre of Harlem, Jalopy Theatre and
    // New York Theatre Ballet are all spelled this way. Renaming one is worse than the spelling.
    for (const text of [
      "Treasure Trunk Theatre runs drama classes and school-holiday camps for children.",
      "It is an affiliate of American Ballet Theatre's National Training Curriculum programs.",
      "Dance Theatre of Harlem School teaches classical ballet to students of all levels.",
    ]) {
      expect(validateCopyQuality(text, "longDescription"), text).toBeNull();
    }
  });

  it("does not flag a capitalised word in proper-noun position", () => {
    expect(validateCopyQuality("Classes run at the Kaufman Music Centre building on West 67th Street.", "longDescription")).toBeNull();
  });

  it("NEVER flags Centre Street — a real Manhattan street, not the common noun", () => {
    // Found 2026-08-09: this blocked United East Athletics Association's own write, "...has run
    // youth-focused sports at 215 Centre Street since 1976...". Renaming a real street is the same
    // class of error as renaming a real theatre.
    for (const text of [
      "United East Athletics Association has run youth sports on Centre Street since 1976.",
      "The organization is at 215 Centre St, a short walk from the courthouses.",
    ]) {
      expect(validateCopyQuality(text, "longDescription"), text).toBeNull();
    }
  });

  it("still flags a capitalised Centre that is not followed by Street/St", () => {
    // The exemption is narrow: capitalised Centre only escapes when Street/St follows immediately.
    // Not preceded by a capitalised word either, so the existing proper-noun rule doesn't save it.
    const err = validateCopyQuality("Classes run at the Centre for years, teaching every age group.", "longDescription");
    expect(err).toContain("Centre");
  });

  it("DOES flag a sentence-initial capital, which is not evidence of a name", () => {
    const err = validateCopyQuality("Programmes run every weekday afternoon for children aged six and over.", "longDescription");
    expect(err).toContain("Programme");
  });

  it("leaves correct US copy alone", () => {
    expect(validateCopyQuality("A neighborhood center running youth programs, swim lessons and summer camps.", "longDescription")).toBeNull();
  });
});
