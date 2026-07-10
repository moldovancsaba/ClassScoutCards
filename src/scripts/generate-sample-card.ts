import { generateCard } from "@/lib/generator/cardGenerator";
import type { GenerateCardInput } from "@/lib/types/provider";

// Sample NYC providers for testing
const sampleInputs: GenerateCardInput[] = [
  {
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
  },
  {
    name: "Manhattan STEM Camp",
    source: "manual",
    category: "Camps",
    borough: "Manhattan",
    neighborhood: "Upper West Side",
    address: "200 W 85th St, New York, NY 10024",
    activityTypes: ["STEM & Technology"],
    ageRanges: ["9–12", "Teens"],
    description: "Summer day camp focused on coding, robotics, and engineering for kids 9-16",
    price: "$500/week",
    website: "https://manhattanstem.example.com",
    email: "camps@manhattanstem.example.com",
  },
];

async function main() {
  console.log("🎨 Generating sample ClassScout cards...\n");

  for (const input of sampleInputs) {
    console.log(`📝 Processing: ${input.name}`);
    
    const result = generateCard(input);
    
    if (!result.success) {
      console.error(`❌ Failed: ${result.error}`);
      continue;
    }

    console.log(`✅ Generated card ID: ${result.card?.id}`);
    
    if (result.warnings.length > 0) {
      console.log(`⚠️  Warnings: ${result.warnings.join(", ")}`);
    }
    
    if (result.missingFields.length > 0) {
      console.log(`📋 Missing fields: ${result.missingFields.join(", ")}`);
    }
    
    console.log(`   Category: ${result.card?.category}`);
    console.log(`   Borough: ${result.card?.borough}`);
    console.log(`   Neighborhood: ${result.card?.neighborhood}`);
    console.log("");
  }

  console.log("✨ Sample generation complete!");
}

main().catch(console.error);
