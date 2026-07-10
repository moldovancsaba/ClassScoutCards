import {
  Provider,
  GenerateCardInput,
  GenerationResult,
  Category,
  Borough,
  AgeRange,
} from "@/lib/types/provider";
import { randomUUID } from "crypto";

// ---- Quality scoring weights ----
const SCORE_FIELDS = {
  name: 5,
  source: 5,
  category: 8,
  borough: 8,
  neighborhood: 4,
  address: 12,
  activityTypes: 8,
  ageRanges: 6,
  description: 16,
  price: 8,
  website: 5,
  phone: 5,
  email: 10,
} as const;
const MAX_SCORE = Object.values(SCORE_FIELDS).reduce((a, b) => a + b, 0); // 100

function scoreProvider(p: GenerateCardInput): { score: number; missing: string[]; warnings: string[] } {
  let score = 0;
  const missing: string[] = [];
  const warnings: string[] = [];

  const has = (v: unknown) => !!v && (typeof v === "string" ? v.trim() : Array.isArray(v) ? v.length > 0 : true);

  if (!has(p.name)) missing.push("name"); else score += SCORE_FIELDS.name;
  if (!has(p.source)) missing.push("source"); else score += SCORE_FIELDS.source;
  if (!has(p.category)) missing.push("category"); else score += SCORE_FIELDS.category;
  if (!has(p.borough)) missing.push("borough"); else score += SCORE_FIELDS.borough;
  if (!has(p.neighborhood)) { missing.push("neighborhood"); } else { score += SCORE_FIELDS.neighborhood; }
  if (!has(p.address)) {
    missing.push("address");
    warnings.push("Address is strongly recommended for provider cards");
  } else {
    score += SCORE_FIELDS.address;
  }

  if (!has(p.activityTypes)) { missing.push("activityTypes"); } else { score += SCORE_FIELDS.activityTypes; }
  if (!has(p.ageRanges)) { missing.push("ageRanges"); warnings.push("Age ranges missing — helps parents filter"); } else { score += SCORE_FIELDS.ageRanges; }

  const desc = p.description;
  if (!has(desc)) { missing.push("description"); }
  else {
    const len = desc!.length;
    if (len < 50) { score += SCORE_FIELDS.description * 0.5; warnings.push("Description too short (<50 chars)"); }
    else if (len < 100) { score += SCORE_FIELDS.description * 0.8; warnings.push("Description could be longer"); }
    else { score += SCORE_FIELDS.description; }
  }

  if (!has(p.price)) missing.push("price") || warnings.push("Price info improves parent decision-making");
  else score += SCORE_FIELDS.price;

  if (!has(p.website)) missing.push("website"); else score += SCORE_FIELDS.website;
  if (!has(p.phone)) missing.push("phone"); else score += SCORE_FIELDS.phone;
  if (!has(p.email)) { missing.push("email"); }
  else score += SCORE_FIELDS.email;

  return { score: Math.round(score), missing, warnings };
}

function normaliseBorough(raw?: string): Borough | undefined {
  if (!raw) return undefined;
  const canonical: Record<string, Borough> = {
    manhattan: "Manhattan",
    brooklyn: "Brooklyn",
    queens: "Queens",
    bronx: "Bronx",
    "staten island": "Staten Island",
  };
  return canonical[raw.toLowerCase().trim()] ?? undefined;
}

function normaliseAgeRange(raw?: string): AgeRange | undefined {
  if (!raw) return undefined;
  const canonical: Record<string, AgeRange> = {
    "0-2": "0–2",
    "0–2": "0–2",
    "3-5": "3–5",
    "3–5": "3–5",
    "6-8": "6–8",
    "6–8": "6–8",
    "9-12": "9–12",
    "9–12": "9–12",
    teens: "Teens",
  };
  return canonical[raw.toLowerCase().trim()];
}

function parsePriceToNumber(price?: string): number | undefined {
  if (!price) return undefined;
  const match = price.match(/\$?([\d,]+(?:\.\d+)?)/);
  return match ? parseFloat(match[1].replace(/,/g, "")) : undefined;
}

export function generateCard(input: GenerateCardInput): GenerationResult {
  const { score, missing, warnings } = scoreProvider(input);

  // Reject if score too low
  if (score < 30) {
    return {
      success: false,
      error: `Quality score too low (${score}/100). Required fields: ${missing.join(", ")}`,
      missingFields: missing,
      warnings,
    };
  }
  if (score < 50) {
    warnings.push(`Low quality score (${score}/100) — consider filling: ${missing.slice(0, 5).join(", ")}`);
  }

  const borough = normaliseBorough(input.borough) ?? (input.borough as Borough) ?? undefined;

  const card: Provider = {
    id: randomUUID(),
    name: input.name.trim(),
    category: (input.category ?? "Classes") as Category,
    borough: borough ?? ("Manhattan" as Borough),
    neighborhood: input.neighborhood ?? "",
    address: input.address ?? "",
    activityTypes: input.activityTypes ?? ["General"],
    ageRanges: input.ageRanges ? input.ageRanges.filter((a) => normaliseAgeRange(a)) : [],
    dayTimeTags: [],
    pricePerClass: parsePriceToNumber(input.price) ?? 0,
    priceText: input.price ?? undefined,
    shortDescription: input.description ? input.description.slice(0, 160) : "",
    longDescription: input.description ?? "",
    email: input.email ?? "",
    website: input.website ?? "",
    phone: input.phone ?? "",
    image: "",
    rating: 0,
    reviewCount: 0,
    badges: [],
    sourceUrl: input.sourceUrl,
    discoveredAt: new Date().toISOString(),
    feedMetadata: {
      source: input.source,
      originalUrl: input.sourceUrl,
      extractedAt: new Date().toISOString(),
      confidence: Math.min(score / 100, 1),
      missingFields: missing,
    },
  };

  return { success: true, card, missingFields: missing, warnings };
}
