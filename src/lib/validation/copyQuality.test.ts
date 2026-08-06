import { describe, expect, it } from "vitest";
import { validateCopyQuality } from "./copyQuality";

describe("validateCopyQuality", () => {
  it("passes clean, real prose", () => {
    expect(validateCopyQuality("A welcoming after-school dance program in Park Slope for ages 3-8.", "shortDescription")).toBeNull();
  });

  it("rejects a URL or Sources line", () => {
    expect(validateCopyQuality("Great classes. Visit https://example.com for info.", "d")).toMatch(/URLs/);
    expect(validateCopyQuality("Great classes. Sources: https://example.com", "d")).toMatch(/URLs/);
  });

  it("rejects scraped navigation/form chrome", () => {
    expect(validateCopyQuality("Skip to main content. Welcome!", "d")).toMatch(/scraped/);
    expect(validateCopyQuality("Zip Code (required) for signup", "d")).toMatch(/scraped/);
  });

  it("rejects carousel dot-indicator artifacts", () => {
    expect(validateCopyQuality("Welcome to our program. • • • •", "d")).toMatch(/scraped/);
  });

  it("does not false-positive on a legitimate space-separated age range", () => {
    expect(validateCopyQuality("A welcoming after-school program for ages 3 4 5 6 accepted here today.", "d")).toBeNull();
  });

  it("rejects generic placeholder copy", () => {
    expect(validateCopyQuality("This is a default short description for NYC families.", "d")).toMatch(/placeholder/);
  });

  it("rejects un-decoded HTML entities", () => {
    expect(validateCopyQuality("We celebrate 32&nbsp;years of service to families.", "d")).toMatch(/HTML entities/);
  });

  it("rejects copy that's too short to be real prose", () => {
    expect(validateCopyQuality("Classes here.", "d")).toMatch(/too short/);
  });
});
