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

/**
 * Area codes actually ASSIGNED in the North American Numbering Plan. Structural validity is not enough:
 * `238-629-9338` and `822-897-7945` both satisfy every NANP shape rule — neither the area code nor the
 * exchange begins 0 or 1 — and neither can be dialled, because 238 has never been assigned and 822 is a
 * reserved toll-free code that cannot be a geographic area code. Both were live on real listings.
 *
 * A list is maintainable in a way a rule is not; NANP area codes change a few times a year, so treat a
 * miss as "add the code", never as "loosen the check".
 */
const ASSIGNED_AREA_CODES = new Set(
  ("201 202 203 204 205 206 207 208 209 210 212 213 214 215 216 217 218 219 220 223 224 225 226 227 228 229 231 234 236 239 240 242 246 248 249 250 251 252 253 254 256 257 260 262 263 264 267 268 269 270 272 274 276 279 281 283 284 289 301 302 303 304 305 306 307 308 309 310 312 313 314 315 316 317 318 319 320 321 323 325 326 327 329 330 331 332 334 336 337 339 340 341 343 345 346 347 350 351 352 354 360 361 363 364 365 367 368 369 380 382 385 386 387 401 402 403 404 405 406 407 408 409 410 412 413 414 415 416 417 418 419 423 424 425 428 430 431 432 434 435 437 438 440 442 443 445 447 448 450 458 460 462 463 464 468 469 470 472 473 474 475 478 479 480 484 501 502 503 504 505 506 507 508 509 510 512 513 514 515 516 517 518 519 520 530 531 534 539 540 541 543 548 551 557 559 561 562 563 564 567 570 571 572 573 574 575 579 580 581 582 584 585 586 587 601 602 603 604 605 606 607 608 609 610 612 613 614 615 616 617 618 619 620 623 626 628 629 630 631 636 639 640 641 645 646 647 649 650 651 656 657 658 659 660 661 662 664 667 669 670 671 672 678 680 681 682 683 684 689 701 702 703 704 705 706 707 708 709 712 713 714 715 716 717 718 719 720 721 724 725 726 727 728 730 731 732 734 737 740 742 743 747 753 754 757 758 760 762 763 765 767 769 770 771 772 773 774 775 778 779 780 781 782 784 785 786 787 801 802 803 804 805 806 807 808 809 810 812 813 814 815 816 817 818 819 820 825 826 828 829 830 831 832 835 838 839 840 843 845 847 848 849 850 854 856 857 858 859 860 862 863 864 865 867 868 869 870 872 873 876 878 879 900 902 903 904 905 906 907 908 909 910 912 913 914 915 916 917 918 919 920 925 928 929 930 931 934 936 937 938 939 940 941 943 945 947 948 949 951 952 954 956 959 970 971 972 973 978 979 980 983 984 985 986 989 " +
   "800 833 844 855 866 877 888").split(" "),
);

/** A number a parent can actually dial: NANP shape AND an area code that exists. */
export function isDialablePhone(value: string | null | undefined): boolean {
  if (!isPlausibleNanpPhone(value)) return false;
  const digits = String(value ?? "").replace(/\b(ext|x|extension)\.?\s*\d+\s*$/i, "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return ASSIGNED_AREA_CODES.has(digits.slice(0, 3));
}

/**
 * True when an "address" states HOW a programme is delivered rather than WHERE a child goes — "Multiple
 * Brooklyn locations", "94 NYCHA community centres citywide", "Touring -- various NYC venues".
 *
 * Distinct from a placeholder address, which at least names one real neighbourhood. This is a pre-screen
 * for two different things and should not be auto-cleared: sometimes it hides a SPLIT candidate (Gjøa, one
 * club with four programme records), and sometimes it is the no-fixed-venue prohibition telling the truth
 * about itself (Mozart for Munchkins, which tours and was quarantined on exactly this evidence).
 */
export function isDeliveryModelAddress(address: string | null | undefined): boolean {
  return /\b(multiple|various|citywide|nyc-?wide|city-?wide|mobile|virtual|online|touring|in-home|several)\b/i.test(
    String(address ?? ""),
  );
}
