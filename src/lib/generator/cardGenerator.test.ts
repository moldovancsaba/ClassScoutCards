import { describe, it, expect } from "vitest";
import { generateCard } from "./cardGenerator";
import type { GenerateCardInput } from "@/lib/types/provider";

const baseInput: GenerateCardInput = {
  name: "Brooklyn Dance Academy",
  source: "manual",
  category: "Classes",
  borough: "Brooklyn",
  neighborhood: "Park Slope",
  address: "145 7th Ave, Brooklyn, NY 11215",
  activityTypes: ["Dance"],
  ageRanges: ["3–5", "6–8"],
  description: "Professional ballet, tap, and contemporary dance classes for children ages 3-12",
  price: "$25-$35 per class",
  website: "https://brooklyndance.example.com",
  phone: "718-555-0100",
  email: "info@brooklyndance.example.com",
};

describe("generateCard", () => {
  it("generates a successful card with full input", () => {
    const result = generateCard(baseInput);

    expect(result.success).toBe(true);
    expect(result.card).toBeDefined();
    expect(result.card?.name).toBe("Brooklyn Dance Academy");
    expect(result.card?.category).toBe("Classes");
    expect(result.card?.borough).toBe("Brooklyn");
    expect(result.card?.priceText).toBe("$25-$35 per class");
    expect(result.missingFields).toEqual([]);
  });

  it("normalizes borough casing", () => {
    // Deliberately out-of-contract input (lowercase borough) to exercise the function's defensive
    // runtime normalization, which is looser than the GenerateCardInput type it declares.
    const result = generateCard({ ...baseInput, borough: "brooklyn" } as unknown as GenerateCardInput);

    expect(result.success).toBe(true);
    expect(result.card?.borough).toBe("Brooklyn");
  });

  it("normalizes age range encodings", () => {
    // Deliberately out-of-contract input (hyphens instead of en-dashes) for the same reason.
    const result = generateCard({ ...baseInput, ageRanges: ["3-5", "6-8"] } as unknown as GenerateCardInput);

    expect(result.success).toBe(true);
    expect(result.card?.ageRanges).toEqual(["3–5", "6–8"]);
  });

  it("rejects cards with very low quality score", () => {
    const result = generateCard({
      name: "X",
      source: "manual",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns warnings for incomplete cards", () => {
    const result = generateCard({
      name: "Brooklyn Dance Academy",
      source: "manual",
      category: "Classes",
      borough: "Brooklyn",
      activityTypes: ["Dance"],
      description: "Short",
    });

    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns a warning when price is missing", () => {
    const result = generateCard({
      ...baseInput,
      price: undefined,
    });

    expect(result.success).toBe(true);
    expect(result.warnings).toContain("Price info improves parent decision-making");
    expect(result.missingFields).toContain("price");
  });

  it("includes feedMetadata with confidence", () => {
    const result = generateCard(baseInput);

    expect(result.card?.feedMetadata).toBeDefined();
    expect(typeof result.card?.feedMetadata?.confidence).toBe("number");
    expect(result.card?.feedMetadata?.confidence).toBeGreaterThan(0);
  });
});
