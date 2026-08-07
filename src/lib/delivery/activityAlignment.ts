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

function derivePrimary(input: AlignActivityTypesInput): string | undefined {
  const candidates = input.activityTypes;
  if (candidates.length === 0) return undefined;
  if (input.primaryActivityType && candidates.includes(input.primaryActivityType)) {
    return input.primaryActivityType;
  }
  const title = (input.title ?? "").toLowerCase();
  if (title) {
    const titleMatch = candidates.find((activity) => title.includes(activity.toLowerCase()));
    if (titleMatch) return titleMatch;
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
  const candidates = [...new Set(input.activityTypes)];
  const primary = derivePrimary({ ...input, activityTypes: candidates });
  if (!primary) return { activityTypes: [], primaryActivityType: undefined, dropped: [] };

  const primaryCluster = clusterFor(primary);
  const ordered = [primary, ...candidates.filter((activity) => activity !== primary)];

  if (!primaryCluster) {
    // Unrecognized activity label -- no cluster to reason about, preserve original relative order.
    return { activityTypes: ordered.slice(0, 3), primaryActivityType: primary, dropped: ordered.slice(3) };
  }

  const related = ordered.filter((activity) => activity === primary || clusterFor(activity) === primaryCluster);
  const kept = related.slice(0, 3);
  const dropped = ordered.filter((activity) => !kept.includes(activity));
  return { activityTypes: kept, primaryActivityType: primary, dropped };
}
