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
  const british = britishSpellingError(value, label);
  if (british) return british;
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

/**
 * British spelling in family-facing copy (owner directive, 2026-08-09: "We use and have to use US English
 * on the site so every content, listing should be rephrased to US English if required").
 *
 * A sweep found 297 live records carrying "programme" (389 times), "centre" (129), "neighbourhood",
 * "organisation", "travelling", "defence" and "enrolment" in their descriptions — much of it written by
 * this loop. A guard is what stops it coming back one description at a time.
 *
 * THE PROPER-NOUN PROBLEM is what makes this more than a word list. Treasure Trunk Theatre, Dance Theatre
 * of Harlem, American Ballet Theatre, Lula Washington Dance Theatre, Jalopy Theatre and New York Theatre
 * Ballet are all spelled that way because that is their NAME. Renaming a real business is a worse defect
 * than the spelling, so:
 *
 *   - a CAPITALISED "Theatre" is never flagged;
 *   - a CAPITALISED "Centre" directly followed by "Street"/"St" is never flagged — Centre Street in
 *     Manhattan (ZIP 10013) is the real, official spelling of a real NYC street, found 2026-08-09 when
 *     it blocked a United East Athletics Association write ("...on Centre Street since 1976...").
 *     Renaming a real street is the same class of error as renaming a real theatre;
 *   - nothing capitalised and directly preceded by another capitalised word is flagged, because that is
 *     proper-noun position ("Music Centre", "Youth Programme").
 *
 * A capital after a full stop IS flagged — sentence-initial position is not evidence of a name.
 */
const BRITISH_SPELLINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bprogrammes?\b/g, "program(s)"],
  [/\bcentres?\b/g, "center(s)"],
  [/\borganisations?\b/g, "organization(s)"],
  [/\borganis(e|es|ed|ing)\b/g, "organize"],
  [/\bspecialis(e|es|ed|ing)\b/g, "specialize"],
  [/\bemphasis(e|es|ed|ing)\b/g, "emphasize"],
  [/\brecognis(e|es|ed|ing)\b/g, "recognize"],
  [/\bneighbourhoods?\b/g, "neighborhood(s)"],
  [/\btravelling\b/g, "traveling"],
  [/\btravelled\b/g, "traveled"],
  [/\bdefence\b/g, "defense"],
  [/\blicence\b/g, "license"],
  [/\benrolment\b/g, "enrollment"],
  [/\bcolours?\b/g, "color(s)"],
  [/\bfavourites?\b/g, "favorite(s)"],
  [/\bmetres?\b/g, "meter(s)"],
  [/\btheatres?\b/g, "theater(s)"],
];

/** The word sits in proper-noun position: capitalised, directly after another capitalised word. */
function inProperNoun(text: string, index: number, word: string): boolean {
  if (!/^[A-Z]/.test(word)) return false;
  return /[A-Z][\w'-]*\s+$/.test(text.slice(Math.max(0, index - 40), index));
}

/** Returns a caller-facing message naming the first British spelling found, or null. */
export function britishSpellingError(value: string, label: string): string | null {
  for (const [pattern, us] of BRITISH_SPELLINGS) {
    const re = new RegExp(pattern.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
      const word = m[0];
      // A capitalised Theatre is somebody's name, always.
      if (/^T/.test(word) && word.toLowerCase().startsWith("theatre")) continue;
      // A capitalised Centre immediately followed by Street/St is the real street name (Centre Street,
      // Manhattan), not the common noun.
      if (/^C/.test(word) && word.toLowerCase().startsWith("centre")
        && /^\s+(?:street|st\.?)\b/i.test(value.slice(m.index + word.length))) continue;
      if (inProperNoun(value, m.index, word)) continue;
      return `${label} uses British spelling ("${word}") — this site serves US families and its copy must be US English. Write "${us}". Proper nouns are exempt: a business genuinely named "... Theatre" keeps its own spelling.`;
    }
  }
  return null;
}
