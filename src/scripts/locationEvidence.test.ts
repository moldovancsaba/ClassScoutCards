import { describe, expect, it } from "vitest";
import {
  extractZip,
  isPlaceholderAddress,
  judgeLocation,
  sharedDefaults,
  zipBorough,
} from "./locationEvidence";

describe("zipBorough — the one location fact that outranks every field on the record", () => {
  it("resolves each borough, and these are the exact ZIPs the 2026-08-08 audit turned on", () => {
    expect(zipBorough("11692")).toBe("Queens"); // Rockaway YMCA, filed under Brooklyn on 9 live records
    expect(zipBorough("10013")).toBe("Manhattan"); // Imagine Skateboarding, borough "Manhattan or Brooklyn"
    expect(zipBorough("10303")).toBe("Staten Island"); // The Big Park, filed under Brooklyn
    expect(zipBorough("11377")).toBe("Queens"); // Lawrence Virgilio Playground, filed under Brooklyn
    expect(zipBorough("11224")).toBe("Brooklyn");
    expect(zipBorough("10465")).toBe("Bronx");
  });

  it("declines rather than guesses — a non-null answer has to be trustworthy", () => {
    expect(zipBorough("07024")).toBeNull(); // Fort Lee NJ: real, serves NYC families, not a borough
    expect(zipBorough("11790")).toBeNull(); // Long Island
    expect(zipBorough("")).toBeNull();
    expect(zipBorough("1234")).toBeNull();
    expect(zipBorough("abcde")).toBeNull();
  });

  it("extracts the ZIP out of the messy address strings actually stored", () => {
    expect(extractZip("207 Beach 73rd Street, Arverne, NY 11692")).toBe("11692");
    expect(extractZip("The Arsenal, Central Park, 830 Fifth Avenue, New York, NY 10065")).toBe("10065");
    expect(extractZip("Manhattanville, Manhattan, NYC")).toBeNull();
  });
});

describe("isPlaceholderAddress — why `neighborhood in address` always passes and proves nothing", () => {
  it("recognises the catalogue's placeholder shape", () => {
    expect(isPlaceholderAddress("Downtown Brooklyn, Brooklyn, NYC")).toBe(true);
    expect(isPlaceholderAddress("Manhattanville, Manhattan, NYC")).toBe(true);
    expect(isPlaceholderAddress("98 4th St, Gowanus, NY 11231")).toBe(false);
    expect(isPlaceholderAddress("")).toBe(false); // absent is not placeholder
  });

  it("is what makes the circular check visible: the address IS the field being checked", () => {
    const address = "Gowanus, Brooklyn, NYC";
    const neighborhood = "Gowanus";
    // The naive audit — and it read as a 22-record clean bill of health.
    expect(address.toLowerCase().includes(neighborhood.toLowerCase())).toBe(true);
    // What it actually established:
    expect(isPlaceholderAddress(address)).toBe(true);
  });
});

describe("sharedDefaults — a value on N unrelated records describes the pipeline, not the records", () => {
  it("catches the 18-record Manhattanville default", () => {
    const rows = [
      { id: "broadway-dance-center", address: "Manhattanville, Manhattan, NYC" },
      { id: "bent-on-learning", address: "Manhattanville, Manhattan, NYC" },
      { id: "lil-kickers", address: "Manhattanville, Manhattan, NYC" },
      { id: "asphalt-green", address: "212 North End Ave, New York, NY 10282" },
    ];
    const shared = sharedDefaults(rows, (r) => r.address);
    expect(shared.get("manhattanville, manhattan, nyc")).toBe(3);
    expect(shared.has("212 north end ave, new york, ny 10282")).toBe(false);
  });

  it("takes a threshold, because the right count depends on the field", () => {
    // Thirty children's businesses really are on the Upper West Side; a shared NEIGHBOURHOOD at that
    // count is unremarkable. A shared full ADDRESS at three is not. Same function, different threshold.
    const rows = Array.from({ length: 30 }, () => ({ nb: "Upper West Side" }));
    expect(sharedDefaults(rows, (r) => r.nb, 1).size).toBe(1);
    expect(sharedDefaults(rows, (r) => r.nb, 50).size).toBe(0);
  });
});

describe("judgeLocation — address beats name beats field, and the exception that makes it a function", () => {
  it("corrects the field when the record's own street address disagrees", () => {
    // Playgarden Prep Tribeca, stored as Upper East Side, address 95 Franklin St.
    const v = judgeLocation({ stored: "Upper East Side", fromAddress: "Tribeca", fromName: "Tribeca" });
    expect(v).toMatchObject({ action: "correct", value: "Tribeca" });
  });

  it("uses the name only when the address is a placeholder", () => {
    // My Gym Park Slope, address the placeholder "DUMBO, Brooklyn, NYC".
    const v = judgeLocation({ stored: "DUMBO", fromName: "Park Slope", addressIsPlaceholder: true });
    expect(v).toMatchObject({ action: "correct", value: "Park Slope" });
  });

  it("REFUSES to let a brand name override a street address — the Williamsburg Soccer Club case", () => {
    // The clubhouse at 33 Nassau Ave is in Greenpoint. A name-wins rule would have "corrected" a field
    // that was already right, so the disagreement is escalated instead of resolved.
    const v = judgeLocation({ stored: "Greenpoint", fromAddress: "Greenpoint", fromName: "Williamsburg" });
    expect(v.action).toBe("needs_human");
    expect(v.because).toMatch(/name can be a brand/);
  });

  it("confirms — and a confirmation has to say what was checked", () => {
    const v = judgeLocation({ stored: "Bay Ridge", fromAddress: "Bay Ridge" });
    expect(v).toMatchObject({ action: "confirmed", value: "Bay Ridge" });
    expect(v.because).toMatch(/street address/);
  });

  it("escalates a record that carries nothing to reason from", () => {
    expect(judgeLocation({ stored: "" }).action).toBe("needs_human");
  });
});
