/**
 * Defect signals for ordering the maintenance queue.
 *
 * Every signal here was found BY HAND while working a batch of six real listings, then turned into a
 * pool-wide measurement. That is the whole method: hand-working a batch is for learning the shapes,
 * measuring them is for finding the rest. Batch 1 (2026-08-09) produced five new ones at once.
 *
 * **Why this exists rather than sorting by `updatedAt`.** The oldest-updated queue stopped working: this
 * project's own bulk sweeps have touched most of the live pool, so "oldest" now surfaces records written
 * minutes ago by the very loop that is asking. A queue has to be built from evidence of harm instead.
 *
 * Measured across 1,040 live providers when written: 497 missing email, 343 descriptions under 120
 * characters, 317 missing phone, 270 placeholder addresses, 222 missing neighbourhood, 125 with the short
 * and long descriptions byte-identical, 63 sharing a stock banner image, 9 in the wrong language.
 * **Only 145 records tripped nothing at all.**
 */

export interface ProviderLike {
  id?: string;
  name?: string | null;
  category?: string | null;
  programType?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  image?: string | null;
  neighborhood?: string | null;
  primaryActivityType?: string | null;
  activityTypes?: string[] | null;
  ageRanges?: string[] | null;
}

export type SignalName =
  | "desc_identical"
  | "desc_tiny"
  | "desc_missing"
  | "desc_not_english"
  | "desc_binary"
  | "desc_page_furniture"
  | "desc_is_a_claim"
  | "addr_placeholder"
  | "addr_missing"
  | "phone_missing"
  | "email_missing"
  | "ages_missing"
  | "website_missing"
  | "activity_missing"
  | "activity_over_cap"
  | "nb_missing"
  | "image_missing"
  | "image_shared"
  | "desc_shared"
  | "format_self_contradiction";

const blank = (v: unknown) => !String(v ?? "").trim();

/**
 * Signals computable from ONE record. `image_shared` is deliberately absent — it needs the whole pool,
 * which is the point of keeping it separate: a single record can never reveal that its photo is stock.
 */
export function providerSignals(p: ProviderLike): SignalName[] {
  const s: SignalName[] = [];
  const short = String(p.shortDescription ?? "").trim();
  const long = String(p.longDescription ?? "").trim();
  const both = `${short} ${long}`;
  const address = String(p.address ?? "").trim();

  // Batch 1, American Youth Dance Theater: short and long were the same 104-character generic sentence.
  if (short && short === long) s.push("desc_identical");
  if (short && short.length < 120) s.push("desc_tiny");
  if (!short && !long) s.push("desc_missing");
  // Batch 1, Kids in Sports UES: both descriptions were Hungarian YouTube Kids boilerplate, because the
  // stored website was youtubekids.com. Batch 6, Brooklyn Design Lab: Indonesian, from an expired domain
  // serving syndicated content — no accents and none of the European stopwords, so a first version missed
  // it. Widening to bare accented characters then produced SEVEN false positives out of nine, because
  // ordinary NYC copy is full of them: Lycée Français, Gjøa, café, piñata. So neither signal fires alone —
  // it takes TWO distinct foreign function words. Brooklyn Design Lab has five; Anderson's Martial Arts
  // Academy has one ("Sifu/Guru Dan", a person's name) and is correctly ignored.
  const foreign = new Set(
    (both.toLowerCase().match(
      /\b(?:kérd|használat|böngész|szülődet|alkalmazás|pour|avec|nous|dalam|yang|untuk|dengan|adalah|saya|telah|berbagai|atau|dari)\b/g,
    ) ?? []),
  );
  if (foreign.size >= 2) s.push("desc_not_english");
  // Batch 6, Textile Arts Center: the description was raw gzip bytes. Control characters and replacement
  // characters cannot occur in copy anyone wrote.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0e-\x1f]|\uFFFD/.test(both)) s.push("desc_binary");
  if (/skip (?:to )?(?:main|navigation)|cookie|sign in|log in|Extract |Summari[sz]e /i.test(both)) s.push("desc_page_furniture");
  // Batch 2, Chess at Three: BOTH descriptions were "A study by the University of Memphis found that
  // chess-playing students improved their problem-solving abilities by 50%." A marketing statistic lifted
  // off the page. It reads like real prose, passes every length and language check, and tells a parent
  // nothing about what their child would actually do.
  if (/\b(?:a study|research (?:shows|found)|studies (?:show|have shown)|scientists found|according to a study)\b/i.test(both)
      || /\b\d{1,3}%\s+(?:of|more|improve|increase|better)/i.test(both)) s.push("desc_is_a_claim");

  // "Gowanus, Brooklyn, NYC" — a neighbourhood wearing an address's clothes. No digits means no street.
  if (address && !/\d/.test(address)) s.push("addr_placeholder");
  if (!address) s.push("addr_missing");

  if (blank(p.phone)) s.push("phone_missing");
  if (blank(p.email)) s.push("email_missing");
  // 2026-08-09: this is the strongest fabrication signal in the set, not a minor completeness gap. Ten
  // live providers had no website, and NINE of them were invented — generic "<Place> <Sport> <Club>"
  // names with plausible street addresses and nothing else: Upper West Side Gymnastics at 415 Amsterdam
  // Ave, West Village Youth Soccer at 75 Jane St, Red Hook Youth Soccer at 1 Clinton St. None exists.
  // A fabricated record with a real-looking address passes every field-level check and looks BETTER than
  // the honest records around it, which is why the cluster survived so long — and why two of them had
  // their neighbourhoods "improved" by this loop before anyone asked whether the business was real.
  if (blank(p.website)) s.push("website_missing");
  if (blank(p.neighborhood)) s.push("nb_missing");
  if (blank(p.image)) s.push("image_missing");
  if (blank(p.primaryActivityType)) s.push("activity_missing");
  if ((p.activityTypes ?? []).length > 3) s.push("activity_over_cap");
  if ((p.ageRanges ?? []).length === 0) s.push("ages_missing");

  // Batch 31 (2026-08-09). `category` and `programType` both hold the FORMAT — the taxonomy's own first
  // rule — so a record where they disagree is refuting itself with no research required, the same class as
  // Ballet Tech's `address` saying Flatiron while its `neighborhood` said Midtown. Three records in two
  // consecutive batches carried one (Asphalt Green: Drop-In Activities vs Camps; World Martial Arts:
  // Birthday Parties vs Classes; KOKO Music: Camps vs Classes), which is what prompted measuring it: **57
  // of 760 live providers**, dominated by `Camps`/`Classes` (14) and `Birthday Parties`/`Classes` (11).
  //
  // Deliberately NOT auto-resolved. The obvious rule — prefer the year-round format, because a school
  // leading with "Camps" in October misleads — is right most of the time and wrong for a genuinely
  // summer-only camp, and this repo has already recorded what a bulk fill keyed on a plausible rule costs.
  // The signal puts the record in the queue; a human decides which of the two fields is the lie.
  const cat = String(p.category ?? "").trim().toLowerCase();
  const prog = String(p.programType ?? "").trim().toLowerCase();
  if (cat && prog && cat !== prog) s.push("format_self_contradiction");
  return s;
}

/**
 * Images used by more than one provider. A shared file is a stock banner, not a photo of anybody's studio
 * — `csny-banner-sports.png` was on 14 unrelated records. Only computable across the pool.
 */
export function sharedImages(providers: readonly ProviderLike[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of providers) {
    const img = String(p.image ?? "").trim();
    if (img) counts.set(img, (counts.get(img) ?? 0) + 1);
  }
  return new Map([...counts].filter(([, n]) => n > 1));
}

/**
 * Descriptions shared word-for-word by more than one provider. **88 of 756 live records — 12% of the
 * catalogue — on 24 distinct texts** when first measured (2026-08-09).
 *
 * This is `sharedImages` applied to the field a family actually reads, and it finds three things no
 * per-record check can, because each of them is only visible when two records are held side by side:
 *
 *   - **Duplicates whose names differ**, which a name scan misses and an address scan misses when the
 *     addresses are placeholders — "Bedstuy Youth Soccer Club" twice, "Brooklyn Rugby" against "Brooklyn
 *     Youth Rugby", "NYPD Cops and Kids Boxing" against "NYC Cops & Kids Boxing Club".
 *   - **A whole cluster scraped off a governing body's site.** Seven unrelated real boxing gyms shared
 *     one text beginning "home about events registered clubs membership info registration forms rules
 *     national rule book" — USA Boxing Metro's own navigation, standing as the description of seven
 *     different businesses.
 *   - **Pipeline-generated filler**, which reads like prose and is not scraped from anywhere: "Youth
 *     soccer classes and leagues in Manhattan." on two records, "Recurring youth sports programme with
 *     multiple sessions available throughout the season." on nine.
 *
 * The 40-character floor matters: below it, short generic fragments collide by coincidence rather than
 * by provenance, and the signal fills with noise.
 */
export function sharedDescriptions(providers: readonly ProviderLike[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of providers) {
    const d = String(p.shortDescription ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (d.length >= 40) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return new Map([...counts].filter(([, n]) => n > 1));
}

export interface RankedProvider {
  id: string;
  name: string;
  signals: SignalName[];
}

/**
 * The maintenance queue: worst-first by signal count.
 *
 * `exclude` is the already-worked set and is not optional in practice — without it a batch loop re-serves
 * the records it just fixed, because fixing a record rarely clears every signal on it (an operator who
 * publishes no email still trips `email_missing` after a perfect review).
 */
export function rankProviders(
  providers: readonly ProviderLike[],
  exclude: ReadonlySet<string> = new Set(),
): RankedProvider[] {
  const shared = sharedImages(providers);
  const sharedDesc = sharedDescriptions(providers);
  return providers
    .filter((p) => p.id && !exclude.has(p.id))
    .map((p) => {
      const signals = providerSignals(p);
      if (shared.has(String(p.image ?? "").trim())) signals.push("image_shared");
      const d = String(p.shortDescription ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (sharedDesc.has(d)) signals.push("desc_shared");
      return { id: String(p.id), name: String(p.name ?? ""), signals };
    })
    .filter((r) => r.signals.length > 0)
    .sort((a, b) => b.signals.length - a.signals.length || a.id.localeCompare(b.id));
}
