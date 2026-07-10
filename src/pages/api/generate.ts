import type { NextApiRequest, NextApiResponse } from "next";
import { generateCard } from "@/lib/generator/cardGenerator";
import { deliverViaIngestApi } from "@/lib/delivery/ingestApi";
import { env } from "@/lib/env";
import type { GenerateCardInput } from "@/lib/types/provider";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const input: GenerateCardInput = req.body;
    
    // Validate input
    if (!input.name) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!input.source) {
      return res.status(400).json({ error: "source is required" });
    }

    // Generate card
    const result = generateCard(input);
    
    if (!result.success || !result.card) {
      return res.status(400).json({
        error: result.error || "Card generation failed",
        missingFields: result.missingFields,
        warnings: result.warnings,
      });
    }

    // Deliver via Ingest API OR directly to MongoDB
    let delivery;
    if (env.MONGODB_URI) {
      // Direct MongoDB write (primary path for ClassScout Atlas)
      try {
        const { saveCardToMongo } = await import("@/lib/delivery/mongoDirect");
        const cardId = await saveCardToMongo(result.card);
        delivery = {
          success: true,
          cardsSent: 1,
          errors: [],
          method: "mongodb-direct",
          cardId,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        delivery = {
          success: false,
          cardsSent: 0,
          errors: ["MongoDB write failed: " + errorMsg],
          method: "mongodb-direct",
        };
      }
    } else if (env.CLASSSCOUT_INGEST_KEY) {
      // Fallback: Ingest API
      delivery = await deliverViaIngestApi([result.card], {
        baseUrl: env.CLASSSCOUT_BASE_URL,
        apiKey: env.CLASSSCOUT_INGEST_KEY,
      });
      delivery.method = "ingest-api";
    } else {
      delivery = {
        success: false,
        cardsSent: 0,
        errors: ["No delivery method configured (MONGODB_URI or CLASSSCOUT_INGEST_KEY)"],
        method: "none",
      };
    }

    // Log to file
    const logEntry = {
      timestamp: new Date().toISOString(),
      cardId: result.card?.id,
      name: result.card?.name,
      category: result.card?.category,
      borough: result.card?.borough,
      neighborhood: result.card?.neighborhood,
      source: input.source,
      deliverySuccess: delivery.success,
    };

    // Append to JSONL log (use /tmp for serverless compatibility)
    const fs = await import("fs");
    const path = await import("path");
    const fsSync = await import("fs");
    const logPath = "/tmp/cards-generated.jsonl";
    
    // Ensure log directory exists
    const logDir = path.dirname(logPath);
    if (!fsSync.existsSync(logDir)) {
      fsSync.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + "\n", "utf-8");

    return res.status(delivery.success ? 200 : 502).json({
      success: delivery.success,
      card: result.card,
      delivery,
      missingFields: result.missingFields,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Generate error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
