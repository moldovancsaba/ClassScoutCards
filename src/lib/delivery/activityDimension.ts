import { normalizePlaceLabel } from "@/lib/delivery/locations";
import { CATEGORY_VALUES } from "@/lib/delivery/cardBridgeRegistry";

/**
 * Splits a stored category/activity label into the two dimensions it has been conflating.
 *
 * WHY THIS EXISTS (owner directive, 2026-08-08, from a screenshot of the live stats page): the page's
 * "By Activity" table listed "Classes" and "Camps" alongside "Soccer" and "Art". Those are not
 * activities -- they are the FORMAT the activity is delivered in, a different axis of the same matrix.
 * A parent filtering for "Camps" and a parent filtering for "Soccer" are asking two different questions,
 * and a single ranked list cannot answer either: "Classes" (277) outranked every real activity purely
 * because most things are classes.
 *
 * The collapse is in the DATA, not just the display -- `contentCards.categoryHint` is one string holding
 * whichever axis discovery happened to latch onto, and 40-odd records hold BOTH as a compound
 * ("Sports / Camp", "Preschool / Camp", "Baseball Camp"). So this splits on "/" and classifies each part,
 * which lets a compound contribute to both breakdowns instead of forming a bucket of its own.
 *
 * A THIRD DIMENSION EXISTS AND HAS NOWHERE TO GO. "Preschool", "Early Childhood" and "Parent & Me" are
 * AGE/audience values, not formats and not activities. They are filed as formats below because the
 * delivery format is what they most nearly constrain, but that is a lesser-of-evils call, not a real
 * classification -- recording it here so the next pass does not mistake it for a considered taxonomy.
 * The real fix is an age dimension in the main app's schema, which is read-only from this repo.
 */

/**
 * The FORMAT axis: how/when an activity is delivered. Closed vocabulary -- anything absent is treated as
 * an activity, so a new activity label needs no maintenance here and only a new FORMAT does.
 * `CATEGORY_VALUES` is the main app's own canonical set; the rest are values found live on real cards.
 */
const FORMAT_VALUES = [
  ...CATEGORY_VALUES,
  // Singular/variant spellings of the canonical four, as actually stored.
  "camp",
  "party",
  "drop-in",
  "class",
  // Formats the canonical set has no value for, all observed live.
  "family events",
  "events",
  "parent groups",
  "meet-up groups",
  "after-school",
  "afterschool",
  "enrichment",
  "multi-enrichment",
  "workshop",
  "retail workshop",
  "public programs",
  "school",
  // Age/audience values -- see the header note. Not really formats.
  "preschool",
  "early childhood",
  "parent & me",
].map((value) => normalizePlaceLabel(value));

const FORMAT_SET = new Set(FORMAT_VALUES);

export type ActivityDimension = "format" | "activity";

/** A format recognised only by its trailing noun ("Baseball Camp"), not as a known format in its own
 *  right. The distinction matters: only these carry an activity in front of the noun to recover. */
function isSuffixOnlyFormat(cleaned: string): boolean {
  if (FORMAT_SET.has(cleaned)) return false;
  return /\b(camp|camps|class|classes|party|parties|workshop|workshops)$/.test(cleaned);
}

/** True for a label naming the delivery format ("Camps") rather than what the child does ("Soccer"). */
export function isFormatLabel(value: string | null | undefined): boolean {
  const cleaned = normalizePlaceLabel(String(value ?? ""));
  if (!cleaned) return false;
  return FORMAT_SET.has(cleaned) || isSuffixOnlyFormat(cleaned);
}

export function dimensionOf(value: string | null | undefined): ActivityDimension {
  return isFormatLabel(value) ? "format" : "activity";
}

/**
 * Splits one stored label into its parts on "/" and buckets each by dimension.
 *
 * "Sports / Camp" yields {activities: ["Sports"], formats: ["Camp"]}; "Baseball Camp" is a single part
 * that is BOTH -- the format suffix is recognised and the activity kept, so it yields
 * {activities: ["Baseball"], formats: ["Baseball Camp"]} rather than losing the sport.
 */
export function splitDimensions(value: string | null | undefined): { activities: string[]; formats: string[] } {
  const raw = String(value ?? "").trim();
  if (!raw) return { activities: [], formats: [] };

  const activities: string[] = [];
  const formats: string[] = [];
  for (const part of raw.split("/").map((p) => p.trim()).filter(Boolean)) {
    if (!isFormatLabel(part)) {
      activities.push(part);
      continue;
    }
    formats.push(part);
    // "Baseball Camp" carries an activity in front of the format noun; strip the noun and keep it.
    // Only for suffix-recognised formats -- "Birthday Parties" is a format outright, and stripping its
    // noun would manufacture a bogus "Birthday" activity out of a value that names no activity at all.
    if (!isSuffixOnlyFormat(normalizePlaceLabel(part))) continue;
    const remainder = part.replace(/\s*\b(camps?|classes|class|part(y|ies)|workshops?)$/i, "").trim();
    if (remainder && remainder.toLowerCase() !== part.toLowerCase() && !isFormatLabel(remainder)) {
      activities.push(remainder);
    }
  }
  return { activities, formats };
}
