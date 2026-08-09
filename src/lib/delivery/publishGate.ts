import { containsScrapedChrome } from "@/lib/validation/copyQuality";

/**
 * PORTED, NOT INVENTED — the main `classscout` repo's own public-visibility gate, replicated here so
 * this bridge can implement it rather than merely refuse to touch it.
 *
 * | Ported here                              | Ported from (main `classscout` repo)                |
 * | ---------------------------------------- | --------------------------------------------------- |
 * | `isImgBbHttpsImageUrl`                   | `src/lib/imgbbUrl.ts`                                |
 * | `isRenderableExceptImage` (the field set)| `src/lib/publicImageSelection.ts`                    |
 * | `providerPublishGate`                    | `src/lib/publicBrowse.ts`'s `isPublicProvider`       |
 * | `containsScrapedChrome`                  | `src/lib/publicDescriptionQuality.ts` (via copyQuality.ts) |
 *
 * WHY THIS EXISTS (2026-08-09). `visibility` and `qualityStatus` have always been DEFENSIVE-only through
 * this bridge: a write may hide, never reveal, because "revealing is the main app's own gate to open and
 * this bridge does not replicate it." That reasoning was right about the risk and wrong about the
 * conclusion — the gate is ordinary, readable, deterministic logic, and refusing to replicate it left
 * real, fully-researched listings permanently invisible with no path forward that did not involve a
 * human editing the database by hand.
 *
 * So the rule is now: a write may reveal a record ONLY when the record, AS IT WILL BE AFTER THAT WRITE,
 * passes this gate in full. That is not a bypass; it is the gate.
 *
 * THE ONE THING WORTH KNOWING BEFORE TRUSTING IT. `publishedAt` is NOT the public gate — it is a sort
 * key (`{publishedAt: -1, id: 1}`), and `getProviderPublishedAt` even defaults it to the epoch. This
 * repo's own stats page reports a "published" count from `publishedAt`, which is a genuinely different
 * question from "can a family see this", and the two numbers differ by hundreds of records. Do not
 * reintroduce a `publishedAt` check here on the assumption that it means visible.
 *
 * HAND-SYNCED, like every other port in this repo. If the main app's `isPublicProvider` changes, this
 * copy goes stale silently — `publishGate.test.ts` pins the field list and the imgbb host rules so a
 * drift at least shows up as a decision someone made rather than an accident.
 */

/** `src/lib/imgbbUrl.ts`. Only imgbb-hosted HTTPS images count as a listing's own image. */
export function isImgBbHttpsImageUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const u = url.trim();
  if (!/^https:\/\//i.test(u)) return false;
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (host === "i.ibb.co" || host === "ibb.co" || host === "image.ibb.co") return true;
    // Suffix match on ".ibb.co" — a leading dot, so "ibb.co.evil.example" correctly fails.
    return host.endsWith(".ibb.co");
  } catch {
    return false;
  }
}

/** The record shape the gate reads. Deliberately loose: it is applied to a merged
 *  {stored document, pending updates} object, not to a typed Provider. */
export interface PublishGateInput {
  name?: unknown;
  category?: unknown;
  borough?: unknown;
  neighborhood?: unknown;
  website?: unknown;
  sourceUrls?: unknown;
  image?: unknown;
  shortDescription?: unknown;
  longDescription?: unknown;
  announcementDescription?: unknown;
  qualityStatus?: unknown;
  visibility?: unknown;
}

export interface PublishGateResult {
  /** True when a family would actually see this listing. */
  ok: boolean;
  /** Every unmet requirement, not just the first — a caller fixing a listing wants the whole list, and
   *  reporting one at a time turns a single research pass into five round-trips. */
  missing: string[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Evaluates the main app's public-visibility gate over a provider record.
 *
 * Note what is NOT required, because each absence is a real decision in the main app rather than an
 * oversight to "fix" here: no phone, no email, no address, no age range, no schedule, no price. Those
 * are quality obligations under this repo's own enrichment mandate — they are not what makes a listing
 * visible, and conflating the two would make this gate refuse listings the main app would happily show.
 */
export function providerPublishGate(record: PublishGateInput): PublishGateResult {
  const missing: string[] = [];

  // `isRenderableExceptImage`: title, category, location, source.
  if (!str(record.name)) missing.push("name is empty");
  if (!str(record.category)) missing.push("category is empty");
  // `listingLocation` is satisfied by the borough alone; a neighbourhood only sharpens the label.
  if (!str(record.borough)) missing.push("borough is empty");
  const source = str(record.website) || (Array.isArray(record.sourceUrls) ? str(record.sourceUrls[0]) : "");
  if (!/^https?:\/\/\S+$/i.test(source)) missing.push("website is not a usable source URL");

  // `hasValidOwnImage` — the requirement that actually blocks most listings.
  if (!isImgBbHttpsImageUrl(record.image)) {
    missing.push("image is not an https imgbb URL (i.ibb.co/...); the main app shows no listing without its own image");
  }

  // The moderation flags this bridge could always set defensively.
  if (str(record.qualityStatus).toLowerCase() === "quarantined") missing.push("qualityStatus is quarantined");
  if (str(record.visibility).toLowerCase() === "hidden") missing.push("visibility is hidden");

  // `containsScrapedChrome` over the concatenated public copy — exactly the main app's own expression.
  const publicCopy = `${str(record.shortDescription)}\n${str(record.longDescription)}\n${str(record.announcementDescription)}`;
  if (containsScrapedChrome(publicCopy)) missing.push("descriptions contain scraped page chrome");

  return { ok: missing.length === 0, missing };
}
