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

    // Deliver via Ingest API
    const delivery = await deliverViaIngestApi([result.card], {
      baseUrl: env.CLASSSCOUT_BASE_URL,
      apiKey: env.CLASSSCOUT_INGEST_KEY,
    });

    // Log to file
    const logEntry = {
      timestamp: new Date().toISOString(),
      input,
      card: result.card,
      delivery,
      missingFields: result.missingFields,
      warnings: result.warnings,
    };
    
    // TODO: Write to data/cards-generated.jsonl
    console.log(JSON.stringify(logEntry));

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
