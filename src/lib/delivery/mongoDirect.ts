import { MongoClient, ServerApiVersion } from "mongodb";
import type { Provider } from "@/lib/types/provider";
import { env } from "@/lib/env";

export interface MongoDeliveryResult {
  success: boolean;
  directWrite: boolean;
  cardsWritten: number;
  error?: string;
}

/**
 * Delivers generated cards directly to MongoDB Atlas
 * Writes to classscoutContentCards collection for the autopilot to process
 */
export async function deliverViaMongo(
  cards: Provider[],
  uri?: string,
  dbName?: string
): Promise<MongoDeliveryResult> {
  const mongoUri = uri || env.MONGODB_URI;
  const databaseName = dbName || env.MONGODB_DB_NAME;

  if (!mongoUri) {
    return {
      success: false,
      directWrite: false,
      cardsWritten: 0,
      error: "MONGODB_URI is not configured",
    };
  }

  let client: MongoClient | undefined;

  try {
    client = new MongoClient(mongoUri, {
      serverApi: { version: ServerApiVersion.v1 },
    });

    await client.connect();
    const db = client.db(databaseName);
    const collection = db.collection("classscoutContentCards");

    // Transform providers into content card format for the autopilot pipeline
    const contentCards = cards.map((card) => ({
      contentCardId: `feed-${card.id}`,
      providerId: card.id,
      state: "DISCOVERED",
      enrichmentStatus: "not_started",
      sourceUrl: card.sourceUrl || card.website || "",
      name: card.name,
      category: card.category,
      borough: card.borough,
      neighborhood: card.neighborhood,
      address: card.address,
      shortDescription: card.shortDescription,
      longDescription: card.longDescription,
      activityTypes: card.activityTypes,
      ageRanges: card.ageRanges,
      website: card.website,
      phone: card.phone,
      email: card.email,
      priceText: card.priceText,
      image: card.image,
      feedSource: "kiloclaw-classscoutcards",
      discoveredAt: card.discoveredAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const result = await collection.insertMany(contentCards, { ordered: false });

    return {
      success: true,
      directWrite: true,
      cardsWritten: result.insertedCount,
    };
  } catch (error) {
    return {
      success: false,
      directWrite: false,
      cardsWritten: 0,
      error: `MongoDB delivery failed: ${error}`,
    };
  } finally {
    await client?.close();
  }
}

/**
 * Tests MongoDB connection
 */
export async function checkMongoHealth(
  uri?: string,
  dbName?: string
): Promise<{
  healthy: boolean;
  collections?: string[];
  error?: string;
}> {
  const mongoUri = uri || env.MONGODB_URI;
  const databaseName = dbName || env.MONGODB_DB_NAME;

  if (!mongoUri) {
    return { healthy: false, error: "MONGODB_URI is not configured" };
  }

  let client: MongoClient | undefined;

  try {
    client = new MongoClient(mongoUri, {
      serverApi: { version: ServerApiVersion.v1 },
    });

    await client.connect();
    const db = client.db(databaseName);
    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();

    return {
      healthy: true,
      collections: collections.map((c: { name: string }) => c.name),
    };
  } catch (error) {
    return { healthy: false, error: `MongoDB connection failed: ${error}` };
  } finally {
    await client?.close();
  }
}
