import { NextApiRequest, NextApiResponse } from "next";
import { checkIngestHealth } from "@/lib/delivery/ingestApi";
import { checkMongoHealth } from "@/lib/delivery/mongoDirect";
import { env } from "@/lib/env";
import { validateEnv } from "@/lib/env";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const envCheck = validateEnv();

    const [ingestHealth, mongoHealth] = await Promise.all([
      checkIngestHealth({
        baseUrl: env.CLASSSCOUT_BASE_URL,
        apiKey: env.CLASSSCOUT_INGEST_KEY,
      }),
      env.MONGODB_URI ? checkMongoHealth() : Promise.resolve({ healthy: false, error: "Not configured" }),
    ]);

    return res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      config: {
        envValid: envCheck.valid,
        envErrors: envCheck.errors,
        classscoutBaseUrl: env.CLASSSCOUT_BASE_URL,
        mongodbConfigured: !!env.MONGODB_URI,
      },
      health: {
        ingestApi: ingestHealth,
        mongodb: mongoHealth,
      },
    });
  } catch (error) {
    console.error("Status check error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
