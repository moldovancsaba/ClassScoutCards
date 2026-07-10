import type { GenerateCardInput, Provider, GenerationResult } from "@/lib/types/provider";
import { randomUUID } from "crypto";

// Quality gate thresholds (aligned with ClassScout's defaults)
const MIN_QUALITY_SCORE = 70;
const FALLBACK_MIN_SCORE = 50;

/**
 * Generates a ClassScout Provider card from raw input
 * Applies quality gates, validation, and enrichment
 */
export function generateCard(input: GenerateCardInput): GenerationResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  let qualityScore = 100;

  // Validate required fields
  if (!input.name) {
    return { success: false, error: "Provider name is required", missingFields: ["name"], warnings };
  }
  if (!input.source) {
    return { success: false, error: "Source is required", missingFields: ["source"], warnings };
  }

  // Infer category if missing
  let category = input.category;
  if (!category) {
    // Try to infer from name/description
    const text = `${input.name} ${input.description || ""}`.toLowerCase();
    if (text.includes("class") || text.includes("lesson")) category = "Classes";
    else if (text.includes("camp")) category = "Camps";
    else if (text.includes("birthday") || text.includes("party")) category = "Birthday Parties";
    else category = "Drop-In Activities";
    warnings.push(`Category inferred as ${category}`);
  }

  // Default location
  const borough = input.borough || "Manhattan";
  const neighborhood = input.neighborhood || borough;
  const address = input.address || borough;

  // Quality scoring
  if (!input.address) qualityScore -= 10;
  if (!input.neighborhood) qualityScore -= 5;
  if (!input.description) qualityScore -= 15;
  if (!input.website && !input.phone) qualityScore -= 20;
  if (!input.email) qualityScore -= 5;
  if (!input.price) qualityScore -= 10;

  // Missing fields tracking
  if (!input.address) missingFields.push("address");
  if (!input.description) missingFields.push("description");
  if (!input.website) missingFields.push("website");
  if (!input.phone) missingFields.push("phone");
  if (!input.email) missingFields.push("email");
  if (!input.price) missingFields.push("price");

  // Quality gate
  if (qualityScore < FALLBACK_MIN_SCORE) {
    return {
      success: false,
      error: `Quality score ${qualityScore} below minimum ${FALLBACK_MIN_SCORE}`,
      missingFields,
      warnings,
    };
  }

  // Build provider card
  const card: Provider = {
    id: randomUUID(),
    name: input.name,
    category,
    borough,
    neighborhood,
    address,
    activityTypes: input.activityTypes || ["General"],
    ageRanges: input.ageRanges || [],
    dayTimeTags: [],
    pricePerClass: parsePrice(input.price) || 0,
    priceText: input.price,
    shortDescription: truncate(input.description || "", 150),
    longDescription: input.description || "",
    email: input.email || "",
    website: input.website || "",
    phone: input.phone || "",
    image: "", // Will be enriched later
    rating: 0,
    reviewCount: 0,
    badges: [],
    sourceUrl: input.sourceUrl,
    discoveredAt: new Date().toISOString(),
    feedMetadata: {
      source: input.source,
      originalUrl: input.sourceUrl,
      extractedAt: new Date().toISOString(),
      confidence: qualityScore / 100,
      missingFields,
    },
  };

  if (missingFields.length > 0) {
    warnings.push(`Card has ${missingFields.length} missing fields: ${missingFields.join(", ")}`);
  }

  return {
    success: true,
    card,
    missingFields,
    warnings,
  };
}

function parsePrice(priceText?: string): number {
  if (!priceText) return 0;
  const match = priceText.match(/\$(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}
