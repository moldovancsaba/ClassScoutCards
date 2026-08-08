import { normalizePlaceLabel } from "@/lib/delivery/locations";

/**
 * NOT a port. The main `classscout` repo has no "is this activity a sport" taxonomy at all --
 * `src/data/catalogFilters.ts`'s `ACTIVITY_TYPES` is a flat 18-chip list where "Sports", "Soccer", and
 * "Basketball" are siblings, not a category and its members. This is this repo's own best-effort
 * classification for the stats page's "Sport Cards" summary, maintained by hand. `normalizePlaceLabel`
 * is reused for the same case/hyphen/whitespace tolerance the real location-matching code uses, so
 * "ICE HOCKEY" and "ice-hockey" both match "ice hockey" below.
 */
const SPORT_ACTIVITY_VALUES = [
  "sports",
  "multi-sport",
  "multi sport",
  "soccer",
  "basketball",
  "baseball",
  "softball",
  "football",
  "flag football",
  "hockey",
  "ice hockey",
  "field hockey",
  "lacrosse",
  "volleyball",
  "tennis",
  "golf",
  "swimming",
  "swim",
  "diving",
  "gymnastics",
  "martial arts",
  "karate",
  "taekwondo",
  "judo",
  "jiu-jitsu",
  "jiu jitsu",
  "boxing",
  "wrestling",
  "track",
  "track & field",
  "track and field",
  "cross country",
  "running",
  "cycling",
  "biking",
  "rowing",
  "crew",
  "skating",
  "ice skating",
  "figure skating",
  "roller skating",
  "skiing",
  "snowboarding",
  "rugby",
  "cricket",
  "bowling",
  "fencing",
  "archery",
  "rock climbing",
  "climbing",
  "ultimate frisbee",
  "frisbee",
  "handball",
  "squash",
  "badminton",
  "water polo",
  "sailing",
  "equestrian",
  "horseback riding",
  "skateboarding",
  "surfing",
  "cheerleading",
  "cheer",
  // Movement/fitness disciplines. Added 2026-08-08 from a live card the owner sent: "Movement Gowanus
  // Youth Programs" displayed chips "SPORTS, YOGA", so the catalogue already treats yoga as belonging to
  // the sport family. Without these, the sport-dominant rule would DROP the specific label and leave the
  // bare parent -- the opposite of the intent, which is that the specific discipline leads.
  "yoga",
  "pilates",
  "fitness",
  "parkour",
  "ninja",
  "ninja warrior",
  "tumbling",
  "acro",
  "acrobatics",
  "circus arts",
  "capoeira",
  "kickboxing",
  "aikido",
  "kung fu",
  "self defense",
  "sailing",
  "kayaking",
  "canoeing",
  "scooter",
  "bmx",
  "chess boxing",
  "multi-sport",
  "athletics",
  "triathlon",
  "pickleball",
  "table tennis",
  "ping pong",
  "dodgeball",
  "flag rugby",
  "netball",
  "hurling",
  "gaelic football",
];
const SPORT_ACTIVITY_SET = new Set(SPORT_ACTIVITY_VALUES);

/**
 * Matches an exact label OR a label that CONTAINS a sport term as whole words -- "Swimming Lessons",
 * "Youth Soccer", "Girls Flag Football" are all sports.
 *
 * Exact matching alone was actively dangerous once the sport-dominant rule landed: that rule drops every
 * non-sport tag from a sport listing, so any real sport label missing from the list above would have been
 * DELETED rather than merely unrecognised. "Swimming Lessons" is the case that caught it. Containment
 * fails safe in the right direction -- an unlisted variant is still recognised as a sport and kept.
 */
export function isSportActivity(value: string | null | undefined): boolean {
  const cleaned = normalizePlaceLabel(String(value ?? ""));
  if (!cleaned) return false;
  if (SPORT_ACTIVITY_SET.has(cleaned)) return true;
  return SPORT_ACTIVITY_VALUES.some((term) =>
    new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(cleaned),
  );
}

/**
 * The PARENT category every sport listing carries (owner directive, 2026-08-08). The taxonomy is two
 * levels: a specific sport ("Soccer", "Lacrosse") plus this parent, so that
 *   - a parent scanning a card sees the sport first and the family it belongs to second,
 *   - analytics can collect every sport listing with one equality check instead of maintaining a list
 *     of sport names at every call site.
 */
export const SPORTS_PARENT = "Sports";

/**
 * Labels that mean "sport, unspecified" and must all collapse to the single parent value. "Multi-Sport"
 * was the stored form on 39 live listings and is being retired: it reads to a parent as though it were a
 * DIFFERENT sport sitting alongside Soccer and Basketball, when it is the same idea as the parent
 * category. Keeping two spellings of one concept also breaks the analytics case this taxonomy exists for.
 */
const GENERIC_SPORT_LABELS = new Set([
  "sports",
  "sport",
  "multi-sport",
  "multi sport",
  "multisport",
  // Other spellings of "sport, unspecified" found live on real listings. Each names no sport a parent
  // could search for, so each is the parent category wearing a different hat.
  "various sports",
  "team sports",
  "field sports",
  "sports camp",
  "multi-sport camp",
  "multi sport camp",
  "gym activities",
  "athletic training",
]);

export function isGenericSportLabel(value: string | null | undefined): boolean {
  return GENERIC_SPORT_LABELS.has(normalizePlaceLabel(String(value ?? "")));
}

/** A sport that is NOT the parent — "Soccer", "Lacrosse". These lead; the parent follows. */
export function isSpecificSport(value: string | null | undefined): boolean {
  return isSportActivity(value) && !isGenericSportLabel(value);
}
