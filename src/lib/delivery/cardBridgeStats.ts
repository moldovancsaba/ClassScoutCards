import { getBridgeDb } from "@/lib/delivery/cardBridgeClient";
import { BRIDGE_REGISTRY } from "@/lib/delivery/cardBridgeRegistry";
import { resolveRegionAndNeighborhood } from "@/lib/delivery/locations";
import { isSportActivity } from "@/lib/delivery/sportActivity";
import { splitDimensions } from "@/lib/delivery/activityDimension";

/** The two collections the stats page covers -- "cards" in this system means contentCards and
 *  providers; meetupGroups/serviceLeads are a different concept and not part of this breakdown. */
export type StatsCollectionKey = "contentCards" | "providers";
export const STATS_COLLECTIONS: readonly StatsCollectionKey[] = ["contentCards", "providers"];

export interface CountBucket {
  value: string;
  total: number;
  published: number;
  notPublished: number;
}

export interface RegionGroup {
  /** Canonical NYC borough or LA area, or "(unresolved)" -- see src/lib/delivery/locations.ts. */
  region: string;
  total: number;
  published: number;
  notPublished: number;
  neighborhoods: CountBucket[];
}

export interface CollectionStats {
  collection: StatsCollectionKey;
  total: number;
  published: number;
  notPublished: number;
  /** Card-level, not tag-level: a card with both "Soccer" and "Basketball" counts once here, unlike
   *  byActivity's per-tag breakdown where it contributes to both buckets. See sportActivity.ts. */
  sportCards: { published: number; all: number };
  byRegion: CountBucket[];
  byNeighborhood: RegionGroup[];
  /** WHAT the child does -- "Soccer", "Art". See activityDimension.ts for why this is separate. */
  byActivity: CountBucket[];
  /** HOW/WHEN it is delivered -- "Classes", "Camps". A different axis of the same matrix. */
  byFormat: CountBucket[];
  /** Records excluded from every breakdown because the catalogue has retired them: QUARANTINED
   *  (content forbidden) and BLOCKED_TERMINAL (no entity). Reported so nothing is silently dropped --
   *  795 restaurant cards from one retired directory were ranking "Italian" as a top child activity. */
  retired: number;
}

interface RawRecord {
  region: string | null | undefined;
  neighborhood: string | null | undefined;
  /** Raw stored labels, still mixing both dimensions -- split at tally time, not here. */
  activities: (string | null | undefined)[];
  published: boolean;
  /** False for records the catalogue has retired: QUARANTINED (content forbidden) and
   *  BLOCKED_TERMINAL (no entity to maintain). Counted, but kept out of every breakdown. */
  maintainable: boolean;
}

/** States whose records are still part of the catalogue. Mirrors MAINTAINABLE_STATES in
 *  src/scripts/defect-cohorts.ts -- QUARANTINED and BLOCKED_TERMINAL are the only exclusions. */
const RETIRED_CONTENT_CARD_STATES = new Set(["QUARANTINED", "BLOCKED_TERMINAL"]);

/** contentCards: state === "PUBLISHED" is the real gate (this bridge can never set it, but it's the
 *  real published signal). providers: publishedAt is stamped once and only once the record is live. */
function isContentCardPublished(doc: { state?: string }): boolean {
  return doc.state === "PUBLISHED";
}
function isProviderPublished(doc: { publishedAt?: unknown }): boolean {
  return Boolean(doc.publishedAt);
}

async function fetchRawRecords(collection: StatsCollectionKey): Promise<RawRecord[]> {
  const config = BRIDGE_REGISTRY[collection];
  const db = getBridgeDb();
  if (collection === "contentCards") {
    // kind: "content" ONLY. The collection also holds auto-generated `kind: "repair"` stubs -- 7,570 of
    // them against 5,056 real cards as of 2026-08-08, so counting them made the page 60% machine noise.
    // They are `repair-<hash>-<blockercode>` documents on `internal://classscout/source-seed/` URLs with
    // no category and no location, and they were the source of both the "no category" bucket and most of
    // the "(none)" bucket the owner saw. They are pipeline bookkeeping, not cards anyone maintains.
    const docs = await db
      .collection(config.mongoCollection)
      .find({ kind: "content" }, { projection: { boroughGuess: 1, neighborhoodGuess: 1, categoryHint: 1, state: 1 } })
      .toArray();
    return docs.map((d) => ({
      region: d.boroughGuess,
      neighborhood: d.neighborhoodGuess,
      activities: [d.categoryHint],
      published: isContentCardPublished(d as { state?: string }),
      maintainable: !RETIRED_CONTENT_CARD_STATES.has(String(d.state ?? "")),
    }));
  }
  const docs = await db
    .collection(config.mongoCollection)
    .find({}, { projection: { borough: 1, neighborhood: 1, activityTypes: 1, publishedAt: 1, qualityStatus: 1 } })
    .toArray();
  return docs.map((d) => ({
    region: d.borough,
    neighborhood: d.neighborhood,
    activities: Array.isArray(d.activityTypes) && d.activityTypes.length > 0 ? d.activityTypes : [null],
    published: isProviderPublished(d as { publishedAt?: unknown }),
    // providers has no state enum -- quarantined is expressed as qualityStatus.
    maintainable: d.qualityStatus !== "quarantined",
  }));
}

function bucketKey(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? "(none)" : trimmed;
}

function newBucket(value: string): CountBucket {
  return { value, total: 0, published: 0, notPublished: 0 };
}

function tally(bucket: { total: number; published: number; notPublished: number }, published: boolean): void {
  bucket.total += 1;
  if (published) bucket.published += 1;
  else bucket.notPublished += 1;
}

function sortDesc<T extends { total: number }>(buckets: T[]): T[] {
  return buckets.sort((a, b) => b.total - a.total);
}

export async function getCollectionStats(collection: StatsCollectionKey): Promise<CollectionStats> {
  const records = await fetchRawRecords(collection);

  let published = 0;
  let notPublished = 0;
  let sportCardsPublished = 0;
  let sportCardsAll = 0;
  const regionBuckets = new Map<string, CountBucket>();
  const neighborhoodByRegion = new Map<string, Map<string, CountBucket>>();
  const activityBuckets = new Map<string, CountBucket>();
  const formatBuckets = new Map<string, CountBucket>();

  let retired = 0;
  for (const record of records) {
    if (record.published) published += 1;
    else notPublished += 1;

    // Retired records still count toward the collection total, and are excluded from every breakdown:
    // a card the catalogue has given up on should not shape what the catalogue looks like.
    if (!record.maintainable) {
      retired += 1;
      continue;
    }

    if (record.activities.some((a) => isSportActivity(a))) {
      sportCardsAll += 1;
      if (record.published) sportCardsPublished += 1;
    }

    const { region, neighborhood } = resolveRegionAndNeighborhood(record.region, record.neighborhood);

    const regionBucket = regionBuckets.get(region) ?? newBucket(region);
    tally(regionBucket, record.published);
    regionBuckets.set(region, regionBucket);

    if (!neighborhoodByRegion.has(region)) neighborhoodByRegion.set(region, new Map());
    const neighborhoodMap = neighborhoodByRegion.get(region)!;
    const neighborhoodBucket = neighborhoodMap.get(neighborhood) ?? newBucket(neighborhood);
    tally(neighborhoodBucket, record.published);
    neighborhoodMap.set(neighborhood, neighborhoodBucket);

    // Split each stored label into its two dimensions and tally into the matching breakdown. Both are
    // deduplicated per record so a card carrying "Camps" and "Baseball Camp" counts once under Camps.
    const activityKeys = new Set<string>();
    const formatKeys = new Set<string>();
    let sawAnyLabel = false;
    for (const rawActivity of record.activities) {
      const { activities, formats } = splitDimensions(rawActivity);
      if (activities.length > 0 || formats.length > 0) sawAnyLabel = true;
      for (const a of activities) activityKeys.add(a);
      for (const f of formats) formatKeys.add(f);
    }
    // A record with a label that was PURELY a format still has no activity, and vice versa. Both get
    // "(none)" so the two breakdowns each total the collection size and can be read independently.
    if (activityKeys.size === 0) activityKeys.add(bucketKey(sawAnyLabel ? "" : null));
    if (formatKeys.size === 0) formatKeys.add(bucketKey(null));

    for (const key of activityKeys) {
      const activityBucket = activityBuckets.get(key) ?? newBucket(key);
      tally(activityBucket, record.published);
      activityBuckets.set(key, activityBucket);
    }
    for (const key of formatKeys) {
      const formatBucket = formatBuckets.get(key) ?? newBucket(key);
      tally(formatBucket, record.published);
      formatBuckets.set(key, formatBucket);
    }
  }

  const byRegion = sortDesc([...regionBuckets.values()]);
  const byNeighborhood: RegionGroup[] = byRegion.map((r) => {
    const neighborhoods = sortDesc([...(neighborhoodByRegion.get(r.value)?.values() ?? [])]);
    return { region: r.value, total: r.total, published: r.published, notPublished: r.notPublished, neighborhoods };
  });
  const byActivity = sortDesc([...activityBuckets.values()]);
  const byFormat = sortDesc([...formatBuckets.values()]);

  return {
    collection,
    total: records.length,
    published,
    notPublished,
    sportCards: { published: sportCardsPublished, all: sportCardsAll },
    byRegion,
    byNeighborhood,
    byActivity,
    byFormat,
    retired,
  };
}

export async function getAllCollectionStats(): Promise<CollectionStats[]> {
  return Promise.all(STATS_COLLECTIONS.map((c) => getCollectionStats(c)));
}
