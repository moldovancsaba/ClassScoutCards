/**
 * Minimal local port of the main classscout app's public-description quality gate
 * (src/lib/publicDescriptionQuality.ts there). Ported, not imported, because this is a separate
 * repo/deployment — kept in sync by hand if the source changes.
 *
 * Used to REJECT a copy-quality write before it ever reaches providers.shortDescription/
 * longDescription/meetupGroups.description, since this bridge writes directly into already-published,
 * public-facing records without going through the main app's publish gate at all. Without this check,
 * a bad write here could reintroduce exactly the "scraped chrome" / URL-leak / placeholder-copy bugs
 * that gate exists to prevent.
 */
const DESCRIPTION_URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;
const DESCRIPTION_SOURCE_LINE_PATTERN = /\s*\bSources?:\s*[\s\S]*$/im;
const HTML_ENTITY_PATTERN = /&(?:nbsp|amp|quot|apos|lt|gt|#\d+|#x[0-9a-fA-F]+);/i;

const SCRAPED_CHROME_PATTERNS = [
  /\bskip to (?:main )?content\b/i,
  /\bskip navigation\b/i,
  /\btoggle mobile menu\b/i,
  /\bopen menu close menu\b/i,
  /\bmain menu\b/i,
  /\bmobile navigation\b/i,
  /\bback to top\b/i,
  /\bshow (?:more|less)\b/i,
  /\bplease select a topic\b/i,
  /\bzip code \(required\)/i,
  /\bname \(required\)/i,
  /\bfirst email \(required\)/i,
  /\brequest my records\b/i,
  /\bmake another type of inquiry\b/i,
  /\bbecome a corporate partner\b/i,
  /\bdonate goods\b/i,
  /\baccept (?:all )?cookies\b/i,
  /\bcookie (?:policy|preferences|settings)\b/i,
  /\bwe use cookies\b/i,
  /\bshare (?:this )?(?:page )?on (?:facebook|twitter|instagram|pinterest)\b/i,
  /\bfollow us on\b/i,
  /^\s*(?:home|homepage)\s*(?:[>›»]|&gt;)/i,
];
const CAROUSEL_ARTIFACT_PATTERN = /(?:[•·]\s*){4,}/;

const GENERIC_PLACEHOLDER_PATTERNS = [
  /\bfor NYC families\.?$/i,
  /\bis a family-facing listing in\b/i,
  /\bdefault (?:short|long) description\b/i,
  /\btest provider\b/i,
];

/** Returns an error message describing the first defect found, or null when the copy is clean. */
export function validateCopyQuality(value: string, label: string): string | null {
  if (DESCRIPTION_URL_PATTERN.test(value) || DESCRIPTION_SOURCE_LINE_PATTERN.test(value)) {
    return `${label} must not contain URLs, www links, or Sources lines; source evidence belongs elsewhere`;
  }
  if (SCRAPED_CHROME_PATTERNS.some((p) => p.test(value)) || CAROUSEL_ARTIFACT_PATTERN.test(value)) {
    return `${label} contains scraped navigation/form/carousel text and must be rewritten`;
  }
  if (GENERIC_PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
    return `${label} contains generic placeholder copy and must be replaced with source-backed prose`;
  }
  if (HTML_ENTITY_PATTERN.test(value)) {
    return `${label} contains un-decoded HTML entities (e.g. &nbsp;, &amp;) and must be cleaned`;
  }
  if (value.trim().length < 20) {
    return `${label} is too short to be real source-backed prose (< 20 chars)`;
  }
  return null;
}

/**
 * The main app's own `containsScrapedChrome` (publicDescriptionQuality.ts), exposed separately from
 * `validateCopyQuality` because it is part of a DIFFERENT question. `validateCopyQuality` decides
 * whether a write may store a string; this decides whether the stored copy lets the listing appear
 * publicly at all — `isPublicProvider` calls it over the concatenated short + long + announcement
 * descriptions, so a listing can pass every write and still be invisible because of copy it already
 * had. See publishGate.ts.
 */
export function containsScrapedChrome(value: string): boolean {
  return SCRAPED_CHROME_PATTERNS.some((p) => p.test(value)) || CAROUSEL_ARTIFACT_PATTERN.test(value);
}
