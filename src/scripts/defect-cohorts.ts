/**
 * defect-cohorts.ts — build the review queue from DEFECT SIGNAL rather than from `updatedAt`.
 *
 * WHY THIS EXISTS (2026-08-08). Step 1 of docs/card-improvement-process.md says "pull the oldest
 * updatedAt". Two things broke that:
 *
 *   1. Bulk sweeps destroy the signal. After the pool-wide provider passes, all 1,027 live listings
 *      shared one `updatedAt`, so oldest-first could no longer tell a genuinely reviewed listing from
 *      one a script had touched.
 *   2. Defects arrive in COHORTS, not one at a time. A single discovery run stamped
 *      `boroughGuess: "Manhattan/Brooklyn"` on every card it produced — 219 of them, six PUBLISHED and
 *      therefore in front of families. Walking oldest-first reaches those six after hundreds of held
 *      cards; querying the value reaches them immediately.
 *
 * The rule this encodes: **oldest-first finds cards, cohort-plus-published-first finds live harm.**
 *
 * READ-ONLY BY DESIGN. This prints a queue; it never writes. Every write still goes through
 * POST /api/card-bridge/update, dry-run first, one reviewed decision at a time. Do not add a write
 * path here — the value of the cohort view is that it makes a human-reviewable list, and a script that
 * both selects and mutates is how a bad rule reaches 219 records at once.
 *
 * Usage:  npx tsx src/scripts/defect-cohorts.ts            (all cohorts, summary)
 *         npx tsx src/scripts/defect-cohorts.ts --list     (also print each card)
 *
 * Env: CARD_BRIDGE_BASE_URL (default https://compare.messmass.com), CARD_BRIDGE_API_KEY.
 */

const BASE = process.env.CARD_BRIDGE_BASE_URL ?? "https://compare.messmass.com";
const KEY = process.env.CARD_BRIDGE_API_KEY ?? "";

/**
 * Each cohort is a filter that has ALREADY produced real findings, with the evidence noted. Add to
 * this list when a batch turns up a defect whose value can be queried directly — that is the loop
 * improving itself. Do not add speculative filters: an empty cohort costs a reader time and teaches
 * nothing, whereas a cohort with a recorded hit count tells the next reviewer where to spend a batch.
 */
const COHORTS: { label: string; filter: Record<string, unknown>; found: string }[] = [
  {
    label: 'boroughGuess "Manhattan/Brooklyn"',
    filter: { kind: "content", boroughGuess: "Manhattan/Brooklyn" },
    found: "219 cards across three compound/delivery-model values; 6 were PUBLISHED",
  },
  {
    label: 'neighborhoodGuess "NYC-wide"',
    filter: { kind: "content", neighborhoodGuess: "NYC-wide" },
    found: "123 cards — usually an operator with no fixed venue, not a lazy guess",
  },
  {
    label: 'neighborhoodGuess "Multiple"',
    filter: { kind: "content", neighborhoodGuess: "Multiple" },
    found: "72 cards — often a genuine split candidate",
  },
  {
    label: "sourceHost google.com (search URL stored as a source)",
    filter: { kind: "content", sourceHost: "google.com" },
    found: "24 cards; 9 were real businesses wrongly QUARANTINED for a pipeline placeholder",
  },
  {
    label: "sourceHost classscout (internal source-seed stubs)",
    filter: { kind: "content", sourceHost: "classscout" },
    found: "47 cards with internal://classscout/source-seed/ URLs, mostly duplicates of real cards",
  },
];

/** Ordered by how much harm a defect in that state is doing right now. PUBLISHED is what families see. */
export const STATE_PRIORITY = ["PUBLISHED", "REVIEW_READY", "DISCOVERED", "PREPARING", "EXTRACTED", "EXTRACTING", "BLOCKED_REPAIRABLE", "PARKED_COOLDOWN", "QUARANTINED", "BLOCKED_TERMINAL"];

export type Card = { contentCardId?: string; title?: string; state?: string; sourceUrl?: string; sourceHost?: string };

/**
 * Dedupe across cohorts (a card can match several) and order by exposure. Exported and unit-tested
 * because it encodes the actual judgement — which card a reviewer opens first — while the fetching
 * around it is plumbing. An unknown state sorts LAST rather than first: a state this script has not
 * heard of is not evidence of urgency, and guessing it is urgent would push real PUBLISHED harm down
 * the queue.
 */
export function prioritise(cards: Card[]): Card[] {
  const seen = new Map<string, Card>();
  for (const c of cards) if (c.contentCardId) seen.set(c.contentCardId, c);
  const rank = (s?: string) => {
    const i = STATE_PRIORITY.indexOf(s ?? "");
    return i === -1 ? STATE_PRIORITY.length : i;
  };
  return [...seen.values()].sort((a, b) => rank(a.state) - rank(b.state));
}

async function fetchPage(filter: Record<string, unknown>, offset: number): Promise<Card[]> {
  const qs = new URLSearchParams({ collection: "contentCards", limit: "25", offset: String(offset), filter: JSON.stringify(filter) });
  // Per-page retry: a transient failure that silently ends enumeration produces a partial scan that
  // reads as a complete one — a mistake made twice in this repo's history and written up both times.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/card-bridge/rows?${qs}`, { headers: { Authorization: `Bearer ${KEY}` } });
      const body = (await res.json()) as { rows?: Card[] };
      if (Array.isArray(body.rows)) return body.rows;
    } catch {
      /* fall through to retry */
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`failed to read offset ${offset} after 5 attempts — do NOT treat this run as complete`);
}

/**
 * Enumerate with a seen-set and stop only when a page adds nothing new. Partition/offset paging
 * silently UNDERCOUNTS otherwise: a page returning exactly `limit` rows may have been truncated, and
 * "no capped partitions remain" has previously read as complete while missing 89 records.
 */
async function enumerate(filter: Record<string, unknown>, cap = 4000): Promise<Card[]> {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (let offset = 0; offset < cap; offset += 25) {
    const rows = await fetchPage(filter, offset);
    if (rows.length === 0) break;
    const fresh = rows.filter((r) => r.contentCardId && !seen.has(r.contentCardId));
    if (fresh.length === 0) break;
    for (const r of fresh) seen.add(r.contentCardId!);
    out.push(...fresh);
  }
  return out;
}

async function main() {
  if (!KEY) throw new Error("CARD_BRIDGE_API_KEY is required");
  const showList = process.argv.includes("--list");
  const everySeen = new Map<string, Card>();

  for (const cohort of COHORTS) {
    const rows = await enumerate(cohort.filter);
    for (const r of rows) if (r.contentCardId) everySeen.set(r.contentCardId, r);
    const byState = new Map<string, number>();
    for (const r of rows) byState.set(r.state ?? "?", (byState.get(r.state ?? "?") ?? 0) + 1);
    const states = STATE_PRIORITY.filter((s) => byState.has(s)).map((s) => `${s}=${byState.get(s)}`).join(" ");
    console.log(`\n${cohort.label}\n  ${rows.length} cards | ${states}\n  previously: ${cohort.found}`);
    if (showList) {
      const sorted = prioritise(rows);
      for (const r of sorted) console.log(`    ${(r.state ?? "?").padEnd(19)} ${r.contentCardId} ${r.title ?? ""}`);
    }
  }

  // The actual queue: everything in any cohort, worst-exposure first. A PUBLISHED card carrying a
  // known defect is doing harm now; a QUARANTINED one is not.
  const queue = prioritise([...everySeen.values()]);
  const live = queue.filter((r) => r.state === "PUBLISHED" || r.state === "REVIEW_READY");
  console.log(`\n=== QUEUE: ${queue.length} distinct cards across all cohorts, ${live.length} of them live ===`);
  for (const r of live) console.log(`  ${(r.state ?? "?").padEnd(13)} ${r.contentCardId} ${r.title ?? ""}`);
}

// Only run when invoked directly. Without this guard, importing `prioritise` for a unit test also
// executes main(), which then calls process.exit(1) for a missing API key and aborts the test run —
// exactly what happened when the test was first added.
const invokedDirectly = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=\/src\/)/, ""));
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
