// Core types aligned with ClassScout's actual Provider schema
// Source: github.com/moldovancsaba/classscout/src/types/provider.ts

export type Category = "Classes" | "Camps" | "Birthday Parties" | "Drop-In Activities";

export type Borough = "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";

export type AgeRange = "0–2" | "3–5" | "6–8" | "9–12" | "Teens";

export type DayTimeTag = "Weekday" | "Weekend" | "Morning" | "Afternoon" | "Evening" | "After-school";

export type ActivityType =
  | "Art & Craft"
  | "Dance"
  | "Music"
  | "Sports & Fitness"
  | "STEM & Technology"
  | "Languages"
  | "Performing Arts"
  | "Academic & Tutoring"
  | "Outdoor & Nature"
  | "Culinary"
  | "Drama & Theater"
  | "General";

export interface Provider {
  // Core identity
  id: string;
  name: string;
  category: Category;
  borough: Borough;
  neighborhood: string;
  address: string;

  // Program details
  activityTypes: string[];
  ageRanges: AgeRange[];
  dayTimeTags: DayTimeTag[];

  // Commerce
  pricePerClass: number;
  priceText?: string;
  
  // Descriptions
  shortDescription: string;
  longDescription: string;

  // Contact
  email: string;
  website: string;
  phone: string;

  // Media
  image: string;
  galleryImages?: string[];

  // Quality signals
  rating: number;
  reviewCount: number;
  badges: string[];

  // Source tracking
  sourceUrl?: string;
  discoveredAt?: string;
  
  // Feed metadata
  feedMetadata?: FeedMetadata;
}

export interface FeedMetadata {
  source: "mommy-poppins" | "lets-go-baby" | "google-places" | "manual" | "api";
  originalUrl?: string;
  extractedAt: string;
  confidence: number; // 0-1
  missingFields: string[];
}

export interface GenerateCardInput {
  source: "mommy-poppins" | "lets-go-baby" | "google-places" | "manual";
  sourceUrl?: string;
  name: string;
  category?: Category;
  borough?: Borough;
  neighborhood?: string;
  address?: string;
  activityTypes?: string[];
  ageRanges?: AgeRange[];
  description?: string;
  price?: string;
  website?: string;
  phone?: string;
  email?: string;
}

export interface GenerationResult {
  success: boolean;
  card?: Provider;
  error?: string;
  missingFields: string[];
  warnings: string[];
}
