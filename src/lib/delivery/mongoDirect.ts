import { MongoClient } from "mongodb";
import { env } from "@/lib/env";
import type { Provider } from "@/lib/types/provider";

interface StoredProvider extends Provider {
  createdAt: Date;
  updatedAt: Date;
}

let cachedClient: MongoClient | null = null;

function getClient(): MongoClient {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI not configured");
  }
  if (!cachedClient) {
    cachedClient = new MongoClient(env.MONGODB_URI, {
      appName: "CARDSAPI",
      maxPoolSize: 5,
    });
  }
  return cachedClient;
}

export async function saveCardToMongo(card: Provider): Promise<string> {
  const client = getClient();
  await client.connect();
  const db = client.db(env.MONGODB_DB_NAME);
  const collection = db.collection<StoredProvider>(env.MONGODB_CARDS_COLLECTION);

  const doc: StoredProvider = {
    ...card,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await collection.insertOne(doc);
  return card.id;
}

export async function saveCardsToMongo(cards: Provider[]): Promise<number> {
  if (cards.length === 0) return 0;
  const client = getClient();
  await client.connect();
  const db = client.db(env.MONGODB_DB_NAME);
  const collection = db.collection<StoredProvider>(env.MONGODB_CARDS_COLLECTION);

  const docs: StoredProvider[] = cards.map((card) => ({
    ...card,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const result = await collection.insertMany(docs);
  return result.insertedCount;
}

export async function getRecentCards(limit = 50, offset = 0): Promise<{ cards: StoredProvider[]; total: number }> {
  const client = getClient();
  await client.connect();
  const db = client.db(env.MONGODB_DB_NAME);
  const collection = db.collection<StoredProvider>(env.MONGODB_CARDS_COLLECTION);

  const total = await collection.countDocuments();
  const cards = await collection
    .find()
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return { cards, total };
}

export async function getCardById(id: string): Promise<StoredProvider | null> {
  const client = getClient();
  await client.connect();
  const db = client.db(env.MONGODB_DB_NAME);
  const collection = db.collection<StoredProvider>(env.MONGODB_CARDS_COLLECTION);

  const card = await collection.findOne({ id });
  return card;
}

export async function checkMongoHealth(): Promise<{
  healthy: boolean;
  error?: string;
  dbName?: string;
  collectionCount?: number;
}> {
  try {
    const client = getClient();
    await client.connect();
    const db = client.db(env.MONGODB_DB_NAME);

    // lightweight ping
    await db.command({ ping: 1 });

    const collections = await db.listCollections().toArray();
    const providerCollection = collections.find(
      (c) => c.name === env.MONGODB_CARDS_COLLECTION
    );

    return {
      healthy: true,
      dbName: env.MONGODB_DB_NAME,
      collectionCount: collections.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { healthy: false, error: message };
  }
}
