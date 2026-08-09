/**
 * Per-FIELD verification provenance, so one freshly-checked phone number stops making a whole record
 * look freshly reviewed.
 *
 * **Approved by the owner, 2026-08-09**, in answer to the recommendation recorded in
 * `docs/classscout-core-recommendations.md` §0b/§0c.
 *
 * ## The problem this exists for
 *
 * Every applied write through this bridge stamps `lastReviewedAt` and `lastReviewedBy` on the whole
 * document. That is right as far as it goes — it records that the loop looked at the card, which
 * `updatedAt` cannot, since anything could have touched that. But it is a RECORD-level claim built from
 * a FIELD-level act. Correct one wrong phone number on a listing whose address is a neighbourhood
 * placeholder, whose image is a stock banner shared with thirteen other businesses and whose age ranges
 * were never checked, and the whole record now reports as reviewed today. The catalogue is full of
 * records in exactly that state, because this loop put them there.
 *
 * The core system's own listing-maintenance specification asks for the same thing, and the owner's
 * complaint that *"a lot of cards does not show when created or last updated"* is the same problem seen
 * from the other end: a freshness signal is only worth showing if it means something specific.
 *
 * ## What it is
 *
 * An append-only array on the record, one entry per field that has actually been checked:
 *
 * ```
 * { field: "phone", verifiedAt: "2026-08-09T…Z", verifiedBy: "<source>", verdict: "corrected",
 *   source: "https://operator.example/contact" }
 * ```
 *
 * `verdict` uses the four values the core spec defines and this repo adopted — `confirmed`, `corrected`,
 * `needs_human`, `should_not_exist`. **`confirmed` is the one that could not be expressed before at all.**
 * A reviewer who reads a phone number, checks it against the operator's own site and finds it right has
 * done real work and changed no bytes; until now that work left no trace, so the next pass had no way to
 * know the field had ever been looked at and would check it again.
 *
 * ## What it is deliberately NOT
 *
 * **Not derived from which fields a write happened to contain.** That would record a verification for a
 * field a bulk sweep set mechanically without anyone establishing anything — precisely the false
 * confidence this is meant to remove. Entries are supplied explicitly by the caller, and a write that
 * supplies none stamps none.
 *
 * **Not a replacement for `lastReviewedAt`.** Both are kept. The record-level stamp answers "did anything
 * look at this card"; the per-field array answers "which of its fields does anyone actually stand behind".
 *
 * **Not retroactive.** Nothing here back-fills history for the ~1,000 records already written without it.
 * Their `lastReviewedAt` remains what it always was — an over-broad claim — and the honest position is
 * that per-field provenance starts now.
 */

/** The verdict vocabulary from the core system's listing-maintenance spec, adopted by this repo. */
export const FIELD_VERDICTS = ["confirmed", "corrected", "needs_human", "should_not_exist"] as const;
export type FieldVerdict = (typeof FIELD_VERDICTS)[number];

export interface FieldVerification {
  /** The record field this entry is about, e.g. "phone", "address", "shortDescription". */
  field: string;
  /** ISO-8601 with milliseconds and Z, matching every other timestamp this bridge writes. */
  verifiedAt: string;
  /** Who or what checked it — the write's `source`, so it matches `lastReviewedBy`. */
  verifiedBy: string;
  verdict: FieldVerdict;
  /** Where the verification came from: a URL, or a short phrase like "operator's own contact page". */
  source?: string;
}

export interface FieldVerificationInput {
  field: string;
  verdict: FieldVerdict;
  source?: string;
}

export interface VerificationBuildResult {
  ok: boolean;
  error?: string;
  /** The full array to persist: prior entries with superseded ones replaced, plus the new ones. */
  value?: FieldVerification[];
}

const MAX_ENTRIES = 200;

/**
 * Merge new verifications into a record's existing array.
 *
 * **Replace-by-field, not append-forever.** An earlier draft appended, which is the obvious design and
 * the wrong one: a field checked on five passes would carry five entries, the array would grow without
 * bound on exactly the records the loop works hardest, and a reader would have to scan for the newest
 * entry to answer the only question anyone asks — *when was this field last stood behind, and by whom?*
 * One entry per field answers it directly. The cap is a backstop against a caller inventing field names.
 */
export function mergeFieldVerifications(
  existing: unknown,
  additions: readonly FieldVerificationInput[],
  verifiedBy: string,
  nowIso: string,
  writableFields: readonly string[],
): VerificationBuildResult {
  if (!Array.isArray(additions) || additions.length === 0) {
    return { ok: false, error: "fieldVerifications must be a non-empty array when present" };
  }
  const allowed = new Set(writableFields);
  const seen = new Set<string>();
  const built: FieldVerification[] = [];

  for (const entry of additions) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "each fieldVerifications entry must be an object" };
    }
    const field = String(entry.field ?? "").trim();
    if (!field) return { ok: false, error: "each fieldVerifications entry needs a non-empty `field`" };
    // A verification for a field this bridge cannot even read or write is meaningless, and would let a
    // caller stamp confidence onto anything at all.
    if (!allowed.has(field)) {
      return {
        ok: false,
        error: `fieldVerifications: "${field}" is not a writable field on this collection, so a verification for it would assert something this bridge cannot see`,
      };
    }
    if (seen.has(field)) {
      return { ok: false, error: `fieldVerifications: duplicate entry for "${field}" in one write` };
    }
    seen.add(field);
    if (!FIELD_VERDICTS.includes(entry.verdict)) {
      return {
        ok: false,
        error: `fieldVerifications: verdict for "${field}" must be one of ${FIELD_VERDICTS.join(", ")}`,
      };
    }
    const source = entry.source == null ? undefined : String(entry.source).trim();
    if (source !== undefined && source.length === 0) {
      return { ok: false, error: `fieldVerifications: \`source\` for "${field}" is present but empty` };
    }
    built.push({ field, verifiedAt: nowIso, verifiedBy, verdict: entry.verdict, ...(source ? { source } : {}) });
  }

  const prior = Array.isArray(existing) ? (existing as FieldVerification[]) : [];
  const kept = prior.filter(
    (e) => e && typeof e === "object" && typeof e.field === "string" && !seen.has(e.field),
  );
  const merged = [...kept, ...built];
  if (merged.length > MAX_ENTRIES) {
    return { ok: false, error: `fieldVerifications would exceed ${MAX_ENTRIES} entries` };
  }
  return { ok: true, value: merged };
}

/**
 * How many of a record's fields carry a verification, and how many of those are `confirmed` or
 * `corrected` rather than escalations.
 *
 * This is what a coverage measurement is built on, and what a "reviewed" badge should read from instead
 * of `lastReviewedAt` — a record with one verified field and eleven unchecked ones is not a reviewed
 * record, however recently something touched it.
 */
export function verificationCoverage(existing: unknown): { verified: number; standsBehind: number; escalated: number } {
  const entries = Array.isArray(existing) ? (existing as FieldVerification[]) : [];
  let standsBehind = 0;
  let escalated = 0;
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    if (e.verdict === "confirmed" || e.verdict === "corrected") standsBehind += 1;
    else if (e.verdict === "needs_human") escalated += 1;
  }
  return { verified: entries.length, standsBehind, escalated };
}
