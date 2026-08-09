/**
 * Places this platform does not serve YET, and the places its existing city vocabularies are missing.
 *
 * **Owner directive, 2026-08-09.** *"You have the right to finetune borough (district) and neighbourhood
 * for any city, never made up always confirm... Out of existing city, out of borough, out of
 * neighbourhoods but real, legit listings should be built properly, create the missing city, borough
 * (district), neighbourhoods for that. They will be precious listings when we expand our services there.
 * The core system will filter out anyway."*
 *
 * This resolves the single longest-standing gap in this catalogue. Before it, a REAL, CONFIRMED children's
 * activity outside the five boroughs had nowhere to go, and the loop's only options were both bad:
 *
 *   - **retire it**, which is what happened to 92NY's Camp Yomi (a 50-acre day camp in Rockland County
 *     with bus service from the city) and NYCFC's academy — real programmes, deleted for the crime of
 *     having an address;
 *   - or **leave a lie in the field**, which is what the data actually did: `boroughGuess: "Long Island"`
 *     on three cards and `"NYC / Long Island"` on a fourth, values that are not boroughs at all.
 *
 * The same gap existed *inside* a served city. Lula Washington Dance Theatre is a decades-old modern dance
 * company and youth school at 3773 Crenshaw Blvd, and this platform's LA vocabulary has **no South Los
 * Angeles area at all** — so it sat under "Central LA" because that was the least wrong option, with an
 * empty neighbourhood because Crenshaw appears in no area's list.
 *
 * ## Two rules this file is built to
 *
 * **Everything here is geography, not judgement.** A district is a county; a neighbourhood is a real named
 * town, village or district. Adding "Huntington" to Suffolk County asserts nothing about any business —
 * it asserts that Huntington is in Suffolk County, which is a fact. The "never made up, always confirm"
 * discipline applies with full force to ASSIGNING a listing to a place; the vocabulary itself has to be
 * accurate but is not a claim about anybody.
 *
 * **These are additions, kept OUT of the ported arrays.** `NEIGHBORHOODS` and `LA_AREAS` in
 * `locations.ts` are hand-synced copies of the main app's own data, and this repo already learned that
 * mixing additions into a ported array is how a hand-synced copy goes stale invisibly — which is why
 * `REAL_NEIGHBORHOODS_EXTRA` exists rather than extra entries in `NEIGHBORHOODS`. Same pattern here.
 *
 * ## Scope, stated plainly
 *
 * Markets are the metro areas from which families realistically reach, or would reach, this service —
 * chosen because listings already in the catalogue sit in them, not speculatively. Districts are counties
 * because a county is the one administrative unit that is unambiguous, stable and universally agreed.
 * Neighbourhood lists are substantial but NOT exhaustive: they cover the towns a children's-activity
 * catalogue actually lands in, and `addExpansionNeighborhood`-style growth is expected. An unmatched town
 * resolves to `null` rather than to a near neighbour, exactly as the NYC and LA resolvers do.
 */

import { compactPlaceLabel, matchCanonicalPlaceLabel, normalizePlaceLabel } from "@/lib/delivery/locations";

// ---------------------------------------------------------------------------------------------------
// Markets outside the served cities
// ---------------------------------------------------------------------------------------------------

export interface ExpansionMarket {
  /** Stable key for the `city` field on a record. Lowercase, hyphenated. */
  key: string;
  /** Human label for the market, as a page would show it. */
  label: string;
  /**
   * Why this market exists as a value rather than as a gap — always a real listing already in the
   * catalogue, never a speculative land-grab.
   */
  evidence: string;
  /** District (county) -> real towns, villages and hamlets within it. */
  districts: Record<string, string[]>;
}

export const EXPANSION_MARKETS: ExpansionMarket[] = [
  {
    key: "long-island",
    label: "Long Island",
    evidence:
      "Three live cards stored the non-borough value `boroughGuess: \"Long Island\"` and a fourth stored " +
      "`\"NYC / Long Island\"`; Goldfish Swim School operates schools in Centereach, Farmingdale and " +
      "Garden City, School of Rock has a Huntington branch, the Postpartum Resource Center of New York " +
      "is a real Nassau County nonprofit, and Tennis Innovators has a Water Mill court.",
    districts: {
      "Nassau County": [
        "Garden City", "Hempstead", "West Hempstead", "Freeport", "Long Beach", "Rockville Centre",
        "Mineola", "Great Neck", "Manhasset", "Port Washington", "Roslyn", "Glen Cove", "Oyster Bay",
        "Syosset", "Jericho", "Hicksville", "Levittown", "Westbury", "Valley Stream", "Lynbrook",
        "Massapequa", "Plainview", "Bethpage", "Farmingdale", "Merrick", "Bellmore", "Wantagh",
        "Seaford", "Baldwin", "Uniondale", "Franklin Square", "New Hyde Park", "Floral Park",
        "Locust Valley", "Sea Cliff", "Woodmere", "Cedarhurst", "Lawrence", "Oceanside", "Island Park",
        "Elmont", "Malverne", "Garden City Park", "Albertson", "Williston Park", "East Meadow",
      ],
      "Suffolk County": [
        "Huntington", "Huntington Station", "Northport", "Cold Spring Harbor", "Melville", "Dix Hills",
        "Commack", "Smithtown", "Kings Park", "Hauppauge", "Islip", "Bay Shore", "West Islip",
        "Babylon", "Lindenhurst", "Deer Park", "Brentwood", "Central Islip", "Amityville", "Sayville",
        "Patchogue", "Bohemia", "Holbrook", "Ronkonkoma", "Centereach", "Selden", "Stony Brook",
        "Setauket", "Port Jefferson", "Miller Place", "Rocky Point", "Wading River", "Riverhead",
        "Shirley", "Mastic", "Southampton", "Water Mill", "Bridgehampton", "Sag Harbor",
        "East Hampton", "Montauk", "Westhampton Beach", "Greenport", "Mattituck", "Sayville",
      ],
    },
  },
  {
    key: "hudson-valley",
    label: "Hudson Valley & Westchester",
    evidence:
      "92NY runs Camp Yomi on 50 acres in Rockland County with bus service from Manhattan, and it was " +
      "RETIRED rather than corrected because there was no value to correct it to. Tim Morehouse Fencing " +
      "has a Westchester club, and NYCFC's youth academy is at the Etihad City Football Academy in " +
      "Orangeburg, Rockland County.",
    districts: {
      "Westchester County": [
        "Yonkers", "New Rochelle", "Mount Vernon", "White Plains", "Scarsdale", "Rye", "Rye Brook",
        "Mamaroneck", "Larchmont", "Harrison", "Port Chester", "Tarrytown", "Sleepy Hollow",
        "Irvington", "Dobbs Ferry", "Hastings-on-Hudson", "Bronxville", "Eastchester", "Tuckahoe",
        "Ardsley", "Elmsford", "Greenburgh", "Chappaqua", "Armonk", "Katonah", "Bedford",
        "Mount Kisco", "Pleasantville", "Briarcliff Manor", "Ossining", "Croton-on-Hudson",
        "Peekskill", "Cortlandt Manor", "Yorktown Heights", "Somers", "Purchase", "Valhalla",
      ],
      "Rockland County": [
        "Nyack", "South Nyack", "West Nyack", "Nanuet", "New City", "Pearl River", "Suffern",
        "Spring Valley", "Orangeburg", "Piermont", "Sparkill", "Tappan", "Blauvelt", "Congers",
        "Valley Cottage", "Stony Point", "Haverstraw", "West Haverstraw", "Pomona", "Monsey",
        "Airmont", "Chestnut Ridge", "Garnerville", "Palisades",
      ],
      "Putnam County": [
        "Carmel", "Mahopac", "Brewster", "Cold Spring", "Putnam Valley", "Patterson", "Garrison",
      ],
      "Orange County": [
        "Newburgh", "Middletown", "Monroe", "Warwick", "Goshen", "Cornwall", "New Windsor", "Chester",
        "Highland Falls", "Washingtonville", "Central Valley", "Woodbury",
      ],
      "Dutchess County": [
        "Poughkeepsie", "Beacon", "Fishkill", "Wappingers Falls", "Rhinebeck", "Red Hook",
        "Hyde Park", "Millbrook", "Pleasant Valley", "LaGrangeville",
      ],
      "Ulster County": ["Kingston", "New Paltz", "Saugerties", "Woodstock", "Highland", "Ellenville"],
    },
  },
  {
    key: "north-jersey",
    label: "Northern New Jersey",
    evidence:
      "Tennis Innovators operates a Fort Lee court, confirmed three separate times by this loop as a real " +
      "location fifteen minutes from the Upper West Side with no taxonomy value available; Kidville's " +
      "own location finder lists exactly two North American studios, one of them in Montclair.",
    districts: {
      "Bergen County": [
        "Fort Lee", "Hackensack", "Englewood", "Englewood Cliffs", "Teaneck", "Ridgewood", "Fair Lawn",
        "Paramus", "Tenafly", "Closter", "Edgewater", "Cliffside Park", "Fairview", "Leonia",
        "Palisades Park", "Bergenfield", "Dumont", "Westwood", "Hillsdale", "Mahwah", "Ramsey",
        "Glen Rock", "Rutherford", "East Rutherford", "Lyndhurst", "Wyckoff", "Franklin Lakes",
        "Alpine", "Demarest", "Norwood", "Northvale", "Emerson", "River Edge", "Oradell",
        "New Milford", "Maywood", "Rochelle Park", "Hasbrouck Heights", "Wood-Ridge", "Ridgefield",
        "Ridgefield Park", "Little Ferry", "Moonachie", "Carlstadt", "Saddle River", "Ho-Ho-Kus",
      ],
      "Hudson County": [
        "Jersey City", "Hoboken", "Weehawken", "Union City", "West New York", "North Bergen",
        "Guttenberg", "Bayonne", "Secaucus", "Kearny", "Harrison", "East Newark",
      ],
      "Essex County": [
        "Newark", "Montclair", "Upper Montclair", "Bloomfield", "Livingston", "Millburn",
        "Short Hills", "South Orange", "Maplewood", "West Orange", "East Orange", "Orange", "Verona",
        "Cedar Grove", "Caldwell", "West Caldwell", "North Caldwell", "Essex Fells", "Nutley",
        "Belleville", "Glen Ridge", "Irvington", "Roseland", "Fairfield",
      ],
      "Passaic County": [
        "Paterson", "Clifton", "Wayne", "Passaic", "Hawthorne", "Totowa", "Little Falls", "Pompton Lakes",
        "Ringwood", "Wanaque", "West Milford",
      ],
      "Union County": [
        "Elizabeth", "Westfield", "Summit", "Cranford", "Union", "Plainfield", "Scotch Plains",
        "Rahway", "Linden", "Springfield", "Berkeley Heights", "New Providence", "Clark", "Roselle",
        "Mountainside", "Kenilworth", "Garwood", "Fanwood",
      ],
      "Morris County": [
        "Morristown", "Madison", "Chatham", "Florham Park", "Parsippany", "Denville", "Randolph",
        "Dover", "Rockaway", "Boonton", "Mountain Lakes", "Chester", "Mendham", "Long Valley",
      ],
    },
  },
  {
    key: "southwest-connecticut",
    label: "Southwest Connecticut",
    evidence:
      "Tim Morehouse Fencing operates a New Canaan club, confirmed by this loop alongside its Westchester " +
      "one as a real location with no taxonomy value available; Chelsea Piers runs a full Stamford " +
      "athletic club, which this catalogue has already encountered as the destination of a mis-routed " +
      "chelseapiers.com contact page.",
    districts: {
      "Fairfield County": [
        "Stamford", "Greenwich", "Old Greenwich", "Cos Cob", "Riverside", "Norwalk", "South Norwalk",
        "Rowayton", "Westport", "Darien", "New Canaan", "Wilton", "Weston", "Ridgefield", "Redding",
        "Danbury", "Bethel", "Newtown", "Brookfield", "Bridgeport", "Fairfield", "Southport",
        "Trumbull", "Shelton", "Stratford", "Monroe", "Easton", "Sherman", "New Fairfield",
      ],
      "New Haven County": [
        "New Haven", "Milford", "Orange", "Woodbridge", "Hamden", "North Haven", "Branford",
        "Guilford", "Madison", "Cheshire", "Wallingford", "Meriden", "Waterbury", "Naugatuck",
        "Ansonia", "Derby", "Seymour", "Oxford",
      ],
    },
  },
];

// ---------------------------------------------------------------------------------------------------
// Resolvers — same exact/compact matching engine the NYC and LA resolvers use, no fuzzy tolerance
// ---------------------------------------------------------------------------------------------------

const MARKET_BY_KEY = new Map(EXPANSION_MARKETS.map((m) => [m.key, m]));

/** Every expansion market key, for validation and for a tenant picker. */
export function expansionMarketKeys(): string[] {
  return EXPANSION_MARKETS.map((m) => m.key);
}

export function findExpansionMarket(key: string | null | undefined): ExpansionMarket | null {
  const k = String(key ?? "").trim().toLowerCase();
  return MARKET_BY_KEY.get(k) ?? null;
}

/**
 * Canonicalize a district (county) name within a market. Exact/compact only — "westchester county",
 * "Westchester County" and "WestchesterCounty" all resolve; "Westchester" does NOT, deliberately, so
 * that a half-written value is a visible miss rather than a silent guess.
 */
export function findExpansionDistrict(marketKey: string | null | undefined, value: string | null | undefined): string | null {
  const market = findExpansionMarket(marketKey);
  if (!market) return null;
  const cleaned = normalizePlaceLabel(String(value ?? ""));
  if (!cleaned) return null;
  return matchCanonicalPlaceLabel(cleaned, Object.keys(market.districts));
}

/** Canonicalize a town within a market's district. Returns null rather than a near neighbour. */
export function findExpansionNeighborhood(
  marketKey: string | null | undefined,
  district: string | null | undefined,
  value: string | null | undefined,
): string | null {
  const market = findExpansionMarket(marketKey);
  if (!market) return null;
  const canonicalDistrict = findExpansionDistrict(marketKey, district);
  if (!canonicalDistrict) return null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return matchCanonicalPlaceLabel(raw, market.districts[canonicalDistrict] ?? []);
}

/**
 * Which market and district a town belongs to, searching every market — for placing a record whose
 * address names a town but whose city and district fields are empty or wrong, which is the state every
 * out-of-area listing in this catalogue is currently in.
 *
 * Returns null on an ambiguous town rather than picking one. That matters: **"Fairfield" is a town in
 * Connecticut AND a township in Essex County, New Jersey**, and "Chester", "Monroe", "Newtown", "Orange",
 * "Milford" and "Greenwich" all collide across state lines in this region too. A silent pick would put a
 * New Jersey business in Connecticut.
 */
export function locateTown(town: string | null | undefined): { market: string; district: string; town: string } | null {
  const raw = String(town ?? "").trim();
  if (!raw) return null;
  const hits: { market: string; district: string; town: string }[] = [];
  for (const market of EXPANSION_MARKETS) {
    for (const [district, towns] of Object.entries(market.districts)) {
      const match = matchCanonicalPlaceLabel(raw, towns);
      if (match) hits.push({ market: market.key, district, town: match });
    }
  }
  // De-duplicate an exact repeat within one market (Sayville appears twice in Suffolk's list).
  const unique = hits.filter(
    (h, i) => hits.findIndex((o) => o.market === h.market && o.district === h.district) === i,
  );
  return unique.length === 1 ? unique[0]! : null;
}

/** Towns that appear in more than one market or district — the reason `locateTown` declines. */
export function ambiguousTowns(): string[] {
  const seen = new Map<string, number>();
  for (const market of EXPANSION_MARKETS) {
    for (const towns of Object.values(market.districts)) {
      for (const t of new Set(towns)) {
        const k = compactPlaceLabel(t);
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
    }
  }
  const dupKeys = new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  const names = new Set<string>();
  for (const market of EXPANSION_MARKETS) {
    for (const towns of Object.values(market.districts)) {
      for (const t of towns) if (dupKeys.has(compactPlaceLabel(t))) names.add(t);
    }
  }
  return [...names].sort();
}

// ---------------------------------------------------------------------------------------------------
// The combined resolver the stats page uses
// ---------------------------------------------------------------------------------------------------

/**
 * Resolve a region + neighbourhood across EVERY vocabulary: the five NYC boroughs, the LA areas, and the
 * expansion markets above.
 *
 * This lives here rather than in `locations.ts` only to keep the import in one direction — `locations.ts`
 * is the ported layer and must not depend on this repo's own additions. `resolveRegionAndNeighborhood`
 * there stays exactly as it was and remains correct for NYC and LA; this wraps it.
 *
 * A district resolves even when its neighbourhood does not, which is the same behaviour the NYC path
 * already has and is deliberate: "Rockland County" with an unrecognised hamlet is a real, groupable
 * answer, and pretending otherwise would throw away the county.
 */
export function resolveAnyRegion(
  rawRegion: string | null | undefined,
  rawNeighborhood: string | null | undefined,
  resolveServedCity: (r: string | null | undefined, n: string | null | undefined) => { region: string; neighborhood: string },
): { region: string; neighborhood: string; market: string | null } {
  const served = resolveServedCity(rawRegion, rawNeighborhood);
  if (served.region !== "(unresolved)") return { ...served, market: null };

  for (const market of EXPANSION_MARKETS) {
    const district = findExpansionDistrict(market.key, rawRegion);
    if (!district) continue;
    return {
      region: district,
      neighborhood: findExpansionNeighborhood(market.key, district, rawNeighborhood) ?? "(unresolved)",
      market: market.key,
    };
  }
  return { region: "(unresolved)", neighborhood: "(unresolved)", market: null };
}
