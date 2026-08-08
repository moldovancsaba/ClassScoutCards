/**
 * Guards for bulk scans, extracted from four false positives that all happened in a single pass on
 * 2026-08-08 and would all have shipped if the match COUNT had been trusted instead of the matches.
 *
 *   `ebay`     matched inside `heal-thebay.org`      (a host denylist)
 *   `Art`      matched inside `mARTial Arts`         (an activity label)
 *   `Richmond` matched inside `1000 Richmond Terrace` (a neighbourhood, filing six museums wrongly)
 *   `$90 per person` extracted from "…$450 per camper per week" (a price, in the field that costs trust)
 *
 * The shared cause is not carelessness about any one regex -- it is that a scan reports a NUMBER, and a
 * number looks equally trustworthy whether or not the matches under it are real. So this module provides
 * both the boundary-safe matchers AND `requireSample`, which makes a plan un-buildable until a sample of
 * its own output has been rendered for a human to read.
 *
 * Read with `docs/card-improvement-process.md` v142.
 */

/** Regex-escape a literal so it can be embedded in a generated pattern. */
export function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `needle` appears in `haystack` delimited by non-alphanumerics — never inside a longer word.
 * This is the `Art`-in-`mARTial` and `ebay`-in-`healthebay` guard.
 */
export function matchesWholeWord(haystack: string, needle: string): boolean {
  const h = String(haystack ?? "").toLowerCase();
  const n = String(needle ?? "").toLowerCase().trim();
  if (!h || !n) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeLiteral(n)}($|[^a-z0-9])`).test(h);
}

/**
 * True when `host` IS the domain or a subdomain of it. Anchored on a dot or the start of the string, so
 * `healthebay.org` no longer matches a denylist entry of `ebay`, and `notyelp.com` does not match `yelp`.
 */
export function hostMatches(host: string, domain: string): boolean {
  const h = String(host ?? "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const d = String(domain ?? "").toLowerCase().replace(/^\./, "");
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/**
 * A place name only counts when it is a COMMA-DELIMITED COMPONENT of the address, not a substring of a
 * street name. "1000 Richmond Terrace, Staten Island, NY 10301" does NOT name the Richmond neighbourhood.
 * A trailing state/ZIP is stripped from each component first, because real addresses carry them.
 */
export function addressNamesPlace(address: string, place: string): boolean {
  const parts = String(address ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase().replace(/\s+(ny|new york|ca|california)\s*\d{0,5}$/i, "").trim())
    .filter(Boolean);
  return parts.includes(String(place ?? "").trim().toLowerCase());
}

/** Every canonical place the address names as a component. More than one means a SPLIT candidate, not a
 *  value to pick from — the "Fort Greene, Park Slope and Cobble Hill locations" case. */
export function placesNamedInAddress(address: string, vocabulary: readonly string[]): string[] {
  return vocabulary.filter((p) => addressNamesPlace(address, p));
}

/** North American Numbering Plan shape, after stripping a trailing extension. Neither the area code nor
 *  the exchange may begin 0 or 1 — which is what makes "259-891-1325" and "594-475-4911" detectable. */
export function isPlausibleNanpPhone(value: string | null | undefined): boolean {
  const withoutExt = String(value ?? "").replace(/\b(ext|x|extension)\.?\s*\d+\s*$/i, "");
  const digits = withoutExt.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(digits)) return false; // 999-999-9999 and friends
  const [area, exchange] = [digits.slice(0, 3), digits.slice(3, 6)];
  return !"01".includes(area[0]) && !"01".includes(exchange[0]);
}

export interface SampleGateOptions<T> {
  /** What the scan is for — appears in the rendered sample and in the throw message. */
  label: string;
  /** How many rows to render. Reading five is the point; rendering fifty defeats it. */
  sampleSize?: number;
  /** One line per row, as a human would need to see it to spot a false positive. */
  render: (item: T) => string;
  /** Where the sample goes. Defaults to stdout; injectable for tests. */
  sink?: (line: string) => void;
}

/**
 * Renders a sample of a scan's own output and returns the rows. Throws when there is nothing to sample
 * but the caller claimed matches — a scan that cannot show its work should not be acted on.
 *
 * This is deliberately a function you must CALL to get the rows, rather than a linting rule or a comment:
 * the failure mode being guarded is a human deciding the sample is unnecessary this once.
 */
export function requireSample<T>(items: readonly T[], options: SampleGateOptions<T>): T[] {
  const { label, render, sampleSize = 5, sink = (l: string) => console.log(l) } = options;
  if (!Array.isArray(items)) throw new TypeError(`${label}: expected an array of scan results`);
  if (typeof render !== "function") throw new TypeError(`${label}: a render function is required — the whole point is to read the matches`);
  sink(`[sample] ${label}: ${items.length} match(es)`);
  if (items.length === 0) {
    sink("[sample] (nothing matched — a zero is also a result worth stating)");
    return [];
  }
  for (const item of items.slice(0, sampleSize)) sink(`[sample]   ${render(item)}`);
  if (items.length > sampleSize) sink(`[sample]   … and ${items.length - sampleSize} more`);
  return [...items];
}

/**
 * A value repeated across records that should each be distinct is a scrape artefact, not a fact. This is
 * what exposed "259-891-1325" on two unrelated providers, one paragraph as two businesses' descriptions,
 * and one website shared by a tennis club and the Brooklyn Nets. Returns the values to DISTRUST.
 */
export function repeatedValues<T>(items: readonly T[], valueOf: (item: T) => string | null | undefined): Set<string> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const v = String(valueOf(item) ?? "").trim().toLowerCase();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([v]) => v));
}
