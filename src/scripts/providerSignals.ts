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
  | "desc_page_furniture"
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
  | "image_shared";

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
  // stored website was youtubekids.com. Accented characters are the cheapest reliable tell.
  if (/[őűáéíóúöüÁÉÍÓÚÖÜŐŰ]|\b(?:kérd|használat|böngész|para|pour|und)\b/.test(both)) s.push("desc_not_english");
  if (/skip (?:to )?(?:main|navigation)|cookie|sign in|log in|Extract |Summari[sz]e /i.test(both)) s.push("desc_page_furniture");

  // "Gowanus, Brooklyn, NYC" — a neighbourhood wearing an address's clothes. No digits means no street.
  if (address && !/\d/.test(address)) s.push("addr_placeholder");
  if (!address) s.push("addr_missing");

  if (blank(p.phone)) s.push("phone_missing");
  if (blank(p.email)) s.push("email_missing");
  if (blank(p.website)) s.push("website_missing");
  if (blank(p.neighborhood)) s.push("nb_missing");
  if (blank(p.image)) s.push("image_missing");
  if (blank(p.primaryActivityType)) s.push("activity_missing");
  if ((p.activityTypes ?? []).length > 3) s.push("activity_over_cap");
  if ((p.ageRanges ?? []).length === 0) s.push("ages_missing");
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
  return providers
    .filter((p) => p.id && !exclude.has(p.id))
    .map((p) => {
      const signals = providerSignals(p);
      if (shared.has(String(p.image ?? "").trim())) signals.push("image_shared");
      return { id: String(p.id), name: String(p.name ?? ""), signals };
    })
    .filter((r) => r.signals.length > 0)
    .sort((a, b) => b.signals.length - a.signals.length || a.id.localeCompare(b.id));
}
