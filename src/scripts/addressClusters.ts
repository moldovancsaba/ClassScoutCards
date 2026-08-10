/**
 * Live providers grouped by their own street address.
 *
 * **Why this is a standing scan rather than a write-time guard.** The address-fill pipeline already refused
 * to write a street address that another listing held, and all 41 of those refusals turned out to be real
 * findings. But a refusal only fires when something tries to write; it is structurally blind to a cluster
 * that is already sitting in the catalogue. Batch 27 (2026-08-09) hit exactly that blind spot by hand:
 * **seven** live provider records read `62 Chelsea Piers, New York, NY 10011` — the Field House, carded once
 * as a venue and six more times as its camps (gymnastics, ninja, multi-sport, soccer, basketball, sports
 * academy) — and three read `653 Schenck Ave` for one community centre in East New York. In both cases the
 * shared address was the entire tell. No research was needed to know something was wrong, only to decide
 * which record survives.
 *
 * Measured when written: 589 of 1,087 live providers carry a real street address, and **100 of them sit on
 * an address another live record also claims**, in 46 clusters.
 *
 * Two things this deliberately does NOT do.
 *
 * **It does not treat a cluster as a defect.** A shared building is ordinary and real: Pier 40 (353 West St)
 * genuinely houses Downtown United Soccer Club, the Village Community Boathouse and Pier 40 Baseball, three
 * unrelated operators that each deserve their own listing. The cluster is a lead, and `classify` only
 * separates the shape that usually is a defect — one operator's programme menu — from the shape that usually
 * is not.
 *
 * **The classifier under-counts on purpose, and knowing by how much matters.** It compares leading name
 * tokens, so `Marlene Meyerson JCC Manhattan` + `Marlene Meyerson JCC Manhattan Sports` + `Day Camp @ the
 * JCC` reads as "mixed" even though all three are one operator at 334 Amsterdam Ave. Read `mixed` as
 * "needs a human to look", never as "cleared".
 */

export interface AddressedRecord {
  id: string;
  name?: string | null;
  address?: string | null;
}

/** Street-type spellings that would otherwise split one address across two clusters. */
const SUFFIX: Record<string, string> = {
  street: "st",
  avenue: "ave",
  av: "ave",
  road: "rd",
  boulevard: "blvd",
  place: "pl",
  drive: "dr",
  parkway: "pkwy",
  court: "ct",
  lane: "ln",
  terrace: "ter",
  square: "sq",
  highway: "hwy",
  turnpike: "tpke",
};

/** Directional prefixes ("East 4th St" vs "E 4th St" — the same building either way). Added 2026-08-10
 *  after cardBridgeCreate.ts's own duplicate-address check missed exactly this pair for a real business
 *  (Evolutionary Martial Arts, 64 E 4th St / 64 East 4th Street) — caught before the create ran, by the
 *  generated id carrying a "-2" suffix for a name that was already live. Mirrored here since this
 *  function is the one cardBridgeCreate.ts's own copy is kept in sync with. */
const DIRECTION: Record<string, string> = { east: "e", west: "w", north: "n", south: "s" };

/**
 * A comparable key for a street address, or null when the value is not a street address at all.
 *
 * Returning null for a placeholder ("Gowanus, Brooklyn, NYC") is load-bearing rather than tidy-minded:
 * 288 live providers store the neighbourhood as the address, so including them would produce enormous
 * clusters that mean only "these are both in Gowanus" — the same circularity `isPlaceholderAddress`
 * exists to name.
 */
export function normalizeStreetAddress(address: string | null | undefined): string | null {
  let a = String(address ?? "").toLowerCase().trim();
  if (!a || !/\d/.test(a)) return null;
  a = a.replace(/,?\s*(?:new york|ny|brooklyn|bronx|queens|staten island|nyc)\b/g, " ");
  a = a.replace(/\b1[01]\d{3}\b/g, " ");
  a = a.replace(/[^a-z0-9 ]/g, " ");
  a = a
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIX[w] ?? DIRECTION[w] ?? w)
    .join(" ");
  return a || null;
}

export interface AddressCluster<T extends AddressedRecord> {
  address: string;
  records: T[];
  /**
   * `one-operator` when every name starts with the same token — a programme menu carded several times.
   * `mixed` when they do not, which is a shared building OR an under-detected one-operator cluster.
   */
  classify: "one-operator" | "mixed";
}

/** Addresses claimed by more than one record, largest cluster first. */
export function addressClusters<T extends AddressedRecord>(records: readonly T[]): AddressCluster<T>[] {
  const groups = new Map<string, T[]>();
  for (const r of records) {
    const key = normalizeStreetAddress(r.address);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }
  return [...groups]
    .filter(([, v]) => v.length > 1)
    .map(([address, recs]) => {
      const leads = new Set(
        recs.map((r) => String(r.name ?? "").trim().split(/\s+/)[0]?.toLowerCase()).filter(Boolean),
      );
      return { address, records: recs, classify: leads.size === 1 ? ("one-operator" as const) : ("mixed" as const) };
    })
    .sort((a, b) => b.records.length - a.records.length || a.address.localeCompare(b.address));
}
