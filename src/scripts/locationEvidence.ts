/**
 * Deciding WHICH of a record's location fields to believe.
 *
 * A provider record can carry a borough, a neighbourhood, an address and a name, and this catalogue has
 * shown all four disagreeing on one record. The audit on 2026-08-08 that produced this module found:
 *
 *   - 26 live records whose `address` was the NYC Parks Department's own HQ ("The Arsenal, Central Park,
 *     830 Fifth Avenue") rather than the park the programme runs in. Two of the parks were not even in
 *     the borough the record claimed -- The Big Park is in Staten Island, Lawrence Virgilio Playground in
 *     Queens, and both were filed under Brooklyn.
 *   - 18 unrelated live records sharing the byte-identical pair `address: "Manhattanville, Manhattan, NYC"`
 *     + `neighborhood: "Harlem"` -- a tutoring company, a dance school, two soccer clubs, two school-yoga
 *     nonprofits. Broadway Dance Center Children & Teens is at 37 W 65th St, Lincoln Square. It is a
 *     pipeline default wearing the costume of a finding.
 *   - 20 records whose own NAME named a different canonical neighbourhood than their `neighborhood` field.
 *
 * The functions here are the parts of that audit that are FACTS rather than judgement, so the judgement
 * has somewhere solid to stand.
 *
 * Read with `docs/card-improvement-process.md` v144 and `scanGuards.ts`, which guards the matching itself.
 */

export type NycBorough = "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";

/**
 * The borough a NYC ZIP code is in. This is a fact about the postal system, not a guess about a business,
 * which is what makes it usable as a tie-breaker against every other field on the record.
 *
 * Ranges are deliberately tight and an unrecognised ZIP returns `null` rather than a nearest guess: this
 * function's whole value is that a non-null answer can be trusted, so it must decline more readily than
 * it invents. Note that it says nothing about NEIGHBOURHOOD -- ZIP boundaries and neighbourhood boundaries
 * genuinely disagree in New York, and an earlier hand-built 21-entry ZIP->neighbourhood map used in this
 * project mapped 11225 to "Prospect Heights" and 11206 to "Williamsburg", both wrong.
 */
export function zipBorough(zip: string): NycBorough | null {
  if (!/^\d{5}$/.test(String(zip ?? "").trim())) return null;
  const n = Number(zip);
  if (n >= 10001 && n <= 10282) return "Manhattan";
  if (n >= 10301 && n <= 10314) return "Staten Island";
  if (n >= 10451 && n <= 10475) return "Bronx";
  if (n >= 11201 && n <= 11256) return "Brooklyn";
  if ((n >= 11004 && n <= 11109) || (n >= 11351 && n <= 11697)) return "Queens";
  return null;
}

/** The first NYC-shaped ZIP in a free-text address, or null. */
export function extractZip(address: string): string | null {
  return (String(address ?? "").match(/\b(1[01]\d{3})\b/) ?? [null, null])[1];
}

/**
 * True when the value is not a street address at all. The catalogue's placeholder shape is
 * "<Neighborhood>, <Borough>, NYC" -- no house number, no street. 288 of 1,040 live providers carried one.
 *
 * Note what this does NOT claim: a placeholder is not automatically wrong. It is a statement at
 * neighbourhood grain, which for a genuinely mobile or in-school operator may be the most that is true.
 * It is only evidence that the field cannot be used to CHECK the neighbourhood, because it was derived
 * from it -- testing `neighborhood in address` against one of these is circular and always passes.
 */
export function isPlaceholderAddress(address: string): boolean {
  const a = String(address ?? "").trim();
  return a.length > 0 && !/\d/.test(a);
}

/**
 * Values appearing on more than `threshold` records that should each be distinct. Returned values are
 * evidence about the PIPELINE and must not be read as evidence about any record carrying them.
 *
 * The threshold matters and should be set by what the value is. A street address on two records is
 * suspicious; a neighbourhood on thirty is not, because thirty children's businesses really are on the
 * Upper West Side. What condemned "Manhattanville, Manhattan, NYC" was not its count alone but that a
 * full ADDRESS -- a field that should be near-unique -- was shared by eighteen unrelated operators.
 */
export function sharedDefaults<T>(
  items: readonly T[],
  valueOf: (item: T) => string | null | undefined,
  threshold = 1,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const v = String(valueOf(item) ?? "").trim().toLowerCase();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return new Map([...counts].filter(([, n]) => n > threshold));
}

export interface LocationClaim {
  /** What the field currently says. */
  stored: string | null | undefined;
  /** The neighbourhood the record's own street address resolves to, if it has one. */
  fromAddress?: string | null;
  /** A canonical neighbourhood named in the record's own title/name. */
  fromName?: string | null;
  /** True when `address` is a placeholder rather than a street address. */
  addressIsPlaceholder?: boolean;
}

export type LocationVerdict =
  | { action: "confirmed"; value: string; because: string }
  | { action: "correct"; value: string; because: string }
  | { action: "needs_human"; because: string };

/**
 * Which of a record's own fields to believe, using nothing but the record.
 *
 * The ordering is address > name > stored, and the exception is the reason it is a function rather than a
 * comment. **A business name is a brand, not an address.** Williamsburg Soccer Club's clubhouse is at 33
 * Nassau Ave, which is in GREENPOINT: the name names a neighbourhood the club is not in, and a name-wins
 * rule would have "corrected" a field that was already right. So the name is consulted only when the
 * address cannot answer -- and when the two disagree outright, nobody gets to win automatically.
 */
export function judgeLocation(claim: LocationClaim): LocationVerdict {
  const stored = String(claim.stored ?? "").trim();
  const addr = String(claim.fromAddress ?? "").trim();
  const name = String(claim.fromName ?? "").trim();
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  if (addr) {
    if (name && !eq(addr, name)) {
      // The street address and the brand name point at different places. Sometimes the address is right
      // (Williamsburg Soccer Club in Greenpoint); sometimes the record is a multi-site operator whose HQ
      // address has overwritten a branch's. Not resolvable from the record.
      return {
        action: "needs_human",
        because: `the stored address resolves to ${addr} but the record's own name names ${name}; a name can be a brand and an address can be a head office, so neither wins automatically`,
      };
    }
    if (eq(addr, stored)) return { action: "confirmed", value: addr, because: `the stored street address resolves to ${addr}` };
    return { action: "correct", value: addr, because: `the record's own street address resolves to ${addr}, not the stored ${stored || "(empty)"}` };
  }

  if (name && claim.addressIsPlaceholder !== false) {
    if (eq(name, stored)) return { action: "confirmed", value: name, because: `the record's own name names ${name}` };
    return {
      action: "correct",
      value: name,
      because: `no street address is stored, and the record's own name names ${name} while the field said ${stored || "(empty)"}`,
    };
  }

  if (stored) return { action: "confirmed", value: stored, because: "nothing on the record contradicts the stored value" };
  return { action: "needs_human", because: "the record carries no address, no place name and no stored value" };
}
