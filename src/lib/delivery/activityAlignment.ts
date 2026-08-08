/**
 * Top-3 activity alignment (owner directive, 2026-08-07) — decides which of a provider's own
 * `activityTypes` actually belong together, so a card never mixes unrelated categories in its stored
 * top-3 the way raw discovery-keyword-scan order can.
 *
 * Real case that prompted this: a "Basketball School" card had `activityTypes` in discovery order
 * `["Music", "Basketball", "Sport", "Soccer", "Handball"]` (Music's keyword happened to fire first in
 * the scan) — the main app's badge picker only reads array order in the one place that bypasses
 * `primaryActivityType` (see `MyAccountView.tsx`'s `SavedProviderCard`, reported separately), so the
 * card showed a Music badge. Even where the main app DOES consult `primaryActivityType` first
 * (`categoryBanner.ts`'s `getPrimaryFirstActivityTypes`, `publicBrowse.ts`), that only reorders which
 * ONE activity leads — it never removes an unrelated activity from the top-3 the way this does. Cutting
 * "Music" from a basketball card's top-3 (keeping "Basketball", "Sport", "Soccer" instead) is a
 * DIFFERENT, complementary fix: which 3 activities are even worth keeping, not just which one is first.
 *
 * `ACTIVITY_CLUSTERS` mirrors the exact canonical activity vocabulary the main `classscout` app's own
 * `extractionEngine.ACTIVITY_KEYWORDS` defines (ported label strings, not the regexes — this bridge
 * never re-scans raw text, it only re-groups already-extracted labels) so a label written through this
 * bridge always matches what the main app's classifier itself would recognize.
 */

/**
 * Ingestion-only placeholder, ported from the main `classscout` app's
 * `extractionEngine.ts` (`NO_CATEGORY_PLACEHOLDER` / `stripActivityPlaceholder`). Discovery seeds the
 * literal string "no category" into `activityTypes` when it has no category hint, and every read path
 * there is supposed to strip it before display.
 *
 * (2026-08-07 finding, owner-reported) It reaches real families anyway: the string is genuinely STORED
 * in live `providers.activityTypes` (25+ records found via the bridge), and the main app's detail/profile
 * components render `provider.activityTypes` raw rather than through its own `topActivityTypes()`
 * normalization seam -- so a card shows a literal "NO CATEGORY" chip. That render bug lives in the
 * read-only main app and is written up as a recommendation; what this bridge CAN do is stop the
 * placeholder ever surviving a write it performs, and clean the stored data.
 *
 * Stripping it here is load-bearing, not cosmetic: without it `derivePrimary` can pick "no category" as
 * the PRIMARY activity whenever the title matches nothing else (real case: "Take Me to the Water" with
 * `["no category","Art","Music","Swimming"]` returned primary "no category" and dropped "Swimming"),
 * which is strictly worse than the mixed-category bug this module was built to fix.
 */
import { isGenericSportLabel, isSpecificSport, isSportActivity, SPORTS_PARENT } from "@/lib/delivery/sportActivity";

export const NO_CATEGORY_PLACEHOLDER = "no category";

function isPlaceholder(activity: string): boolean {
  return activity.trim().toLowerCase() === NO_CATEGORY_PLACEHOLDER;
}

export const ACTIVITY_CLUSTERS: Record<string, readonly string[]> = {
  sportsAndFitness: ["Sports", "Soccer", "Basketball", "Gymnastics", "Martial Arts", "Swimming", "Yoga"],
  artsAndPerformance: ["Dance", "Art", "Music", "Theater"],
  academicAndStem: ["STEM", "Science", "Language", "Tutoring"],
  playAndRecreation: ["Indoor Play", "Outdoor Activities", "Birthday Entertainment"],
};

const CLUSTER_BY_ACTIVITY = new Map<string, string>();
for (const [cluster, activities] of Object.entries(ACTIVITY_CLUSTERS)) {
  for (const activity of activities) CLUSTER_BY_ACTIVITY.set(activity, cluster);
}

export function clusterFor(activity: string): string | undefined {
  return CLUSTER_BY_ACTIVITY.get(activity);
}

export interface AlignActivityTypesInput {
  /** The candidate activities found for this listing, in whatever order discovery produced them. */
  activityTypes: readonly string[];
  /** The classifier's own verdict, when already computed — trusted over a title guess when present
   *  and still a member of `activityTypes` (stale data otherwise, same rule `getPrimaryFirstActivityTypes`
   *  already uses). */
  primaryActivityType?: string | null;
  /** The listing's own name/title — the strongest signal for which activity it's actually known for,
   *  used only when `primaryActivityType` is absent or stale. */
  title?: string | null;
}

export interface AlignActivityTypesResult {
  /** At most 3 entries: the primary activity first, then any OTHER candidates from the SAME cluster,
   *  in their original relative order. Never mixes clusters. */
  activityTypes: string[];
  /** The activity this alignment treated as the headline — always the first entry of `activityTypes`
   *  (or undefined when there were no candidates at all). */
  primaryActivityType?: string;
  /** Candidates that were cut for being outside the primary's cluster (or beyond the top-3 cap) —
   *  kept only for callers that want to record what was dropped and why, never written back. */
  dropped: string[];
}

/**
 * Keyword patterns per canonical activity, ported from the main `classscout` app's
 * `extractionEngine.ACTIVITY_KEYWORDS` (same regexes, same order). Used ONLY to read a listing's own
 * title -- this bridge never re-scans body text.
 *
 * (2026-08-07) Added after the `no category` cleanup exposed a real weakness: matching a title by exact
 * activity-label substring only ("does the title contain the word 'Swimming'?") misses every listing
 * that names its activity the way people actually do. Real cases from live data -- "Park Slope Academy
 * Jiu Jitsu Kids" has no literal "Martial Arts" in it, and "Take Me to the Water" has no literal
 * "Swimming" -- so both fell through to `candidates[0]`, i.e. raw discovery-scan order, which is exactly
 * the arbitrary ordering this module exists to distrust. Removing the placeholder from slot 0 made that
 * fallback visible by promoting whatever happened to sit second (usually "Art").
 */
const ACTIVITY_TITLE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Sports", /\bsport|athletic\b/i],
  ["Dance", /\bdance|ballet|hip hop\b/i],
  ["Gymnastics", /\bgymnastics\b/i],
  ["Art", /\bart|craft|painting|drawing\b/i],
  ["Music", /\bmusic|sing|piano|guitar|drum\b/i],
  ["STEM", /\bstem|coding|robot|engineering\b/i],
  ["Martial Arts", /\bkarate|taekwondo|jiu jitsu|martial arts|mma\b/i],
  ["Swimming", /\bswim|swimming|aquatic|water\b/i],
  ["Theater", /\btheater|theatre|acting|drama\b/i],
  ["Language", /\blanguage|spanish|mandarin|bilingual\b/i],
  ["Tutoring", /\btutoring|academic support\b/i],
  ["Indoor Play", /\bindoor play|play space|open play\b/i],
  ["Outdoor Activities", /\boutdoor|garden|park\b/i],
  ["Yoga", /\byoga\b/i],
  ["Soccer", /\bsoccer\b/i],
  ["Basketball", /\bbasketball\b/i],
  ["Science", /\bscience\b/i],
  ["Birthday Entertainment", /\bbirthday\b/i],
];

/**
 * Whole-word containment: does `title` name `activity` as words rather than as a substring buried in a
 * longer word? "Brooklyn Martial Arts Academy" names "Martial Arts" but does NOT name "Art", even
 * though "martial" contains the letters a-r-t. Boundaries are non-letter/digit rather than `\b` on the
 * raw label, so multi-word labels and labels with punctuation ("Arts & Crafts") behave the same way.
 */
function titleNamesActivity(title: string, activity: string): boolean {
  const label = activity.trim();
  if (!label) return false;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(title);
}

function derivePrimary(input: AlignActivityTypesInput): string | undefined {
  const candidates = input.activityTypes;
  if (candidates.length === 0) return undefined;
  if (input.primaryActivityType && candidates.includes(input.primaryActivityType)) {
    return input.primaryActivityType;
  }
  const title = input.title ?? "";
  if (title) {
    // 1. The title literally names one of the candidate activities ("Basketball School").
    //    Two things this must NOT do, both found by review on 2026-08-08 and both reproducible with
    //    the single title "Brooklyn Martial Arts Academy" against candidates ["Art", "Martial Arts"]:
    //      (a) match on a bare substring -- "mARTial" contains "art", so a naive `includes` finds the
    //          "Art" tag inside the word "martial"; and
    //      (b) return the FIRST candidate that matches in raw array order -- discovery-scan order, the
    //          very ordering this module exists to distrust.
    //    Together those made a martial-arts academy an Art card AND then dropped its real "Martial
    //    Arts" tag, because Art sits in a different cluster. Fixed by requiring a whole-word match and
    //    preferring the LONGEST matching label, so a compound name always outranks a word inside it.
    const matches = candidates
      .filter((activity) => titleNamesActivity(title, activity))
      .sort((a, b) => b.length - a.length);
    if (matches.length > 0) return matches[0];

    // 2. The title names it the way people actually write it ("Jiu Jitsu" -> Martial Arts). Only
    //    activities the listing ALREADY carries are eligible -- this never invents a new tag.
    //    Most specific wins: a specific sport outranks the generic "Sports" bucket. Order here is the
    //    hand-tuned order of ACTIVITY_TITLE_PATTERNS, NOT longest-label-first as in step 1 -- label
    //    length is a fair proxy for specificity when the title literally contains the label, and a bad
    //    one when it does not. Sorting this list by length was tried and regressed a real test case:
    //    "Park Slope Academy Jiu Jitsu Kids" matches both "Martial Arts" (jiu jitsu) and "Outdoor
    //    Activities" (the "park" keyword, firing on "Park Slope" the PLACE), and the longer label is
    //    the wrong one. Step 1's whole-word check is what resolves the Art/Martial Arts case; this step
    //    only runs when the title names no candidate outright.
    const keywordMatches = ACTIVITY_TITLE_PATTERNS
      .filter(([activity, pattern]) => candidates.includes(activity) && pattern.test(title))
      .map(([activity]) => activity);
    const specific = keywordMatches.find((activity) => activity !== "Sports");
    if (specific) return specific;
    if (keywordMatches.length > 0) return keywordMatches[0];
  }
  return candidates[0];
}

/**
 * Pure, deterministic realignment — no I/O, no randomness. Given a listing's raw candidate activities,
 * returns the top-3 that actually belong on the card together: the primary activity first, then only
 * OTHER candidates from the primary's own cluster (Sports & Fitness / Arts & Performance /
 * Academic & STEM / Play & Recreation). An activity outside every defined cluster (a custom/legacy tag
 * `ACTIVITY_CLUSTERS` doesn't recognize) falls back to the prior "top 3 in original order" behavior for
 * safety, rather than aggressively dropping everything down to one entry on unfamiliar data.
 */
export function alignActivityTypes(input: AlignActivityTypesInput): AlignActivityTypesResult {
  // Strip the ingestion placeholder BEFORE anything else -- it must never be eligible to become the
  // primary activity, nor occupy one of the three slots. See NO_CATEGORY_PLACEHOLDER above.
  const placeholders = [...new Set(input.activityTypes)].filter(isPlaceholder);
  const deduped = [...new Set(input.activityTypes)].filter((activity) => !isPlaceholder(activity));

  // Collapse every "sport, unspecified" spelling onto the single parent label before anything reasons
  // about the list, so "Multi-Sport" can never survive as though it were a sport in its own right.
  const normalised = deduped.map((activity) => (isGenericSportLabel(activity) ? SPORTS_PARENT : activity));
  const candidates = [...new Set(normalised)];

  // SPORT-DOMINANT RULE (owner directive, 2026-08-08). If a listing involves ANY sport, it is a sport
  // listing: every non-sport tag is dropped, not merely deprioritised. Two reasons, both the owner's.
  // Editorially the catalogue is focusing on sport first, so a swim school tagged "Swimming, Art, Music"
  // should read as a swim school. Structurally it also removes the cross-cluster mixing this module was
  // built for -- a sport listing can no longer carry an Art tag at all.
  //
  // Ordering is part of the directive and is not cosmetic: the SPECIFIC sport leads and the parent
  // "Sports" sits SECOND, so a parent reads "Soccer, Sports" rather than having to infer the family, and
  // analytics can collect every sport listing on one equality check.
  const sportCandidates = candidates.filter((activity) => isSportActivity(activity));
  if (sportCandidates.length > 0) {
    const specific = sportCandidates.filter((activity) => isSpecificSport(activity));
    const primarySport =
      derivePrimary({ ...input, primaryActivityType: input.primaryActivityType && isSpecificSport(input.primaryActivityType) ? input.primaryActivityType : null, activityTypes: specific }) ?? SPORTS_PARENT;
    const kept =
      primarySport === SPORTS_PARENT
        ? [SPORTS_PARENT]
        : [primarySport, SPORTS_PARENT, ...specific.filter((activity) => activity !== primarySport)].slice(0, 3);
    const dropped = [...deduped.filter((activity) => !kept.includes(isGenericSportLabel(activity) ? SPORTS_PARENT : activity)), ...placeholders];
    return { activityTypes: kept, primaryActivityType: kept[0], dropped: [...new Set(dropped)] };
  }

  const primaryInput = input.primaryActivityType && isPlaceholder(input.primaryActivityType) ? null : input.primaryActivityType;
  const primary = derivePrimary({ ...input, primaryActivityType: primaryInput, activityTypes: candidates });
  if (!primary) return { activityTypes: [], primaryActivityType: undefined, dropped: placeholders };

  const primaryCluster = clusterFor(primary);
  const ordered = [primary, ...candidates.filter((activity) => activity !== primary)];

  if (!primaryCluster) {
    // Unrecognized activity label -- no cluster to reason about, preserve original relative order.
    return { activityTypes: ordered.slice(0, 3), primaryActivityType: primary, dropped: [...ordered.slice(3), ...placeholders] };
  }

  const related = ordered.filter((activity) => activity === primary || clusterFor(activity) === primaryCluster);
  const kept = related.slice(0, 3);
  const dropped = [...ordered.filter((activity) => !kept.includes(activity)), ...placeholders];
  return { activityTypes: kept, primaryActivityType: primary, dropped };
}
