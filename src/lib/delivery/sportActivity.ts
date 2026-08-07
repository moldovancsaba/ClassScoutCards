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
];
const SPORT_ACTIVITY_SET = new Set(SPORT_ACTIVITY_VALUES);

export function isSportActivity(value: string | null | undefined): boolean {
  const cleaned = normalizePlaceLabel(String(value ?? ""));
  if (!cleaned) return false;
  return SPORT_ACTIVITY_SET.has(cleaned);
}
