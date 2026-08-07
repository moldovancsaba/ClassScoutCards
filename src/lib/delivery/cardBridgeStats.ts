import { getBridgeDb } from "@/lib/delivery/cardBridgeClient";
import { BRIDGE_REGISTRY } from "@/lib/delivery/cardBridgeRegistry";
import { resolveRegionAndNeighborhood } from "@/lib/delivery/locations";
import { isSportActivity } from "@/lib/delivery/sportActivity";

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
  byActivity: CountBucket[];
}

interface RawRecord {
  region: string | null | undefined;
  neighborhood: string | null | undefined;
  activities: (string | null | undefined)[];
  published: boolean;
}

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
    const docs = await db
      .collection(config.mongoCollection)
      .find({}, { projection: { boroughGuess: 1, neighborhoodGuess: 1, categoryHint: 1, state: 1 } })
      .toArray();
    return docs.map((d) => ({
      region: d.boroughGuess,
      neighborhood: d.neighborhoodGuess,
      activities: [d.categoryHint],
      published: isContentCardPublished(d as { state?: string }),
    }));
  }
  const docs = await db
    .collection(config.mongoCollection)
    .find({}, { projection: { borough: 1, neighborhood: 1, activityTypes: 1, publishedAt: 1 } })
    .toArray();
  return docs.map((d) => ({
    region: d.borough,
    neighborhood: d.neighborhood,
    activities: Array.isArray(d.activityTypes) && d.activityTypes.length > 0 ? d.activityTypes : [null],
    published: isProviderPublished(d as { publishedAt?: unknown }),
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

  for (const record of records) {
    if (record.published) published += 1;
    else notPublished += 1;

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

    for (const rawActivity of record.activities) {
      const key = bucketKey(rawActivity);
      const activityBucket = activityBuckets.get(key) ?? newBucket(key);
      tally(activityBucket, record.published);
      activityBuckets.set(key, activityBucket);
    }
  }

  const byRegion = sortDesc([...regionBuckets.values()]);
  const byNeighborhood: RegionGroup[] = byRegion.map((r) => {
    const neighborhoods = sortDesc([...(neighborhoodByRegion.get(r.value)?.values() ?? [])]);
    return { region: r.value, total: r.total, published: r.published, notPublished: r.notPublished, neighborhoods };
  });
  const byActivity = sortDesc([...activityBuckets.values()]);

  return {
    collection,
    total: records.length,
    published,
    notPublished,
    sportCards: { published: sportCardsPublished, all: sportCardsAll },
    byRegion,
    byNeighborhood,
    byActivity,
  };
}

export async function getAllCollectionStats(): Promise<CollectionStats[]> {
  return Promise.all(STATS_COLLECTIONS.map((c) => getCollectionStats(c)));
}
