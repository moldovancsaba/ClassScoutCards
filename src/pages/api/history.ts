import { NextApiRequest, NextApiResponse } from "next";
import { env } from "@/lib/env";
import fs from "fs";
import path from "path";

interface CardLogEntry {
  timestamp: string;
  cardId: string;
  name: string;
  category: string;
  borough: string;
  neighborhood: string;
  source: string;
  deliverySuccess: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const logPath = path.join(process.cwd(), "data", "cards-generated.jsonl");
    
    let cards: CardLogEntry[] = [];
    
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      cards = lines.map((line) => JSON.parse(line));
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const paginatedCards = cards.slice(offset, offset + limit);

    return res.status(200).json({
      total: cards.length,
      offset,
      limit,
      cards: paginatedCards,
    });
  } catch (error) {
    console.error("History error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
