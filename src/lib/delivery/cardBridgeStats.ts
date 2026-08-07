import { getBridgeDb } from "@/lib/delivery/cardBridgeClient";
import { BRIDGE_REGISTRY } from "@/lib/delivery/cardBridgeRegistry";

/** The two collections the stats page covers -- "cards" in this system means contentCards and
 *  providers; meetupGroups/serviceLeads are a different concept and not part of this breakdown. */
export type StatsCollectionKey = "contentCards" | "providers";
export const STATS_COLLECTIONS: readonly StatsCollectionKey[] = ["contentCards", "providers"];

export interface CountBucket {
  value: string;
  count: number;
}

export interface CollectionStats {
  collection: StatsCollectionKey;
  total: number;
  byBorough: CountBucket[];
  byNeighborhood: CountBucket[];
  byActivity: CountBucket[];
}

const BOROUGH_FIELD: Record<StatsCollectionKey, string> = {
  contentCards: "boroughGuess",
  providers: "borough",
};
const NEIGHBORHOOD_FIELD: Record<StatsCollectionKey, string> = {
  contentCards: "neighborhoodGuess",
  providers: "neighborhood",
};
/** contentCards.categoryHint is a single string; providers.activityTypes is an array (up to 3 per
 *  record) -- the array is unwound so each activity type counts once per record that carries it. */
const ACTIVITY_FIELD: Record<StatsCollectionKey, string> = {
  contentCards: "categoryHint",
  providers: "activityTypes",
};
const ACTIVITY_IS_ARRAY: Record<StatsCollectionKey, boolean> = {
  contentCards: false,
  providers: true,
};

/** Groups a field's values into counts, folding both a missing field and an empty string into a
 *  single "(none)" bucket -- this run set boroughGuess/neighborhoodGuess/categoryHint to "" on
 *  several off-topic-contamination cards, and that should read the same as "never set" here. */
async function countByField(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  mongoCollection: string,
  field: string,
  isArrayField: boolean,
): Promise<CountBucket[]> {
  const pipeline: Record<string, unknown>[] = [];
  if (isArrayField) {
    pipeline.push({ $unwind: { path: `$${field}`, preserveNullAndEmptyArrays: true } });
  }
  pipeline.push(
    { $group: { _id: { $cond: [{ $in: [`$${field}`, [null, ""]] }, "(none)", `$${field}` ] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  );
  const rows = await db.collection(mongoCollection).aggregate(pipeline).toArray();
  return rows.map((r: { _id: unknown; count: number }) => ({ value: String(r._id), count: r.count }));
}

export async function getCollectionStats(collection: StatsCollectionKey): Promise<CollectionStats> {
  const config = BRIDGE_REGISTRY[collection];
  const db = getBridgeDb();
  const total = await db.collection(config.mongoCollection).estimatedDocumentCount();
  const [byBorough, byNeighborhood, byActivity] = await Promise.all([
    countByField(db, config.mongoCollection, BOROUGH_FIELD[collection], false),
    countByField(db, config.mongoCollection, NEIGHBORHOOD_FIELD[collection], false),
    countByField(db, config.mongoCollection, ACTIVITY_FIELD[collection], ACTIVITY_IS_ARRAY[collection]),
  ]);
  return { collection, total, byBorough, byNeighborhood, byActivity };
}

export async function getAllCollectionStats(): Promise<CollectionStats[]> {
  return Promise.all(STATS_COLLECTIONS.map((c) => getCollectionStats(c)));
}
