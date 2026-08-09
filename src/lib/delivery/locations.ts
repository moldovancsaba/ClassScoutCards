/**
 * Ported from the main `classscout` repo (as of 2026-08-07), NOT imported — there is no shared
 * package between the two repos/deployments. Source: `src/data/locations.ts`, `src/data/
 * laLocations.ts`, `src/data/placeLabelNormalize.ts`. This is the exact canonicalization logic the
 * main app's own coverage/scarcity/publish-gate code uses to turn a raw `boroughGuess`/
 * `neighborhoodGuess` string into a real borough/neighborhood, or `null` when it can't (a multi-
 * borough string like "Manhattan/Brooklyn", or "NYC", or unrecognized garbage) -- built here so the
 * stats page groups records the same way the core app does, instead of by naive raw-string equality.
 *
 * Deliberately NOT ported: the HITL "knowledge overlay" (`setNeighborhoodOverlay` in the main repo) --
 * that's live, operator-approved runtime state specific to the main app's own process; this bridge has
 * no equivalent and falls back to the static registry only, which is the correct default behavior
 * (empty overlay) in the main app too.
 *
 * `findCanonicalArea` (LA borough-equivalent) and `findCanonicalLANeighborhood` are NOT ports --
 * no LA equivalent of `findCanonicalBorough`/`findCanonicalNeighborhood` exists in the main repo (LA
 * region/neighborhood values are apparently stored pre-canonicalized already). They're this repo's own
 * additions, built from the same general-purpose primitives (exact/compact match only -- no
 * edit-distance typo tolerance, since the main app doesn't apply that to LA data either).
 *
 * If the main app's version of any of this changes, this copy goes stale silently -- it is hand-synced,
 * not automated.
 */

export type Borough = "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";

// ---- placeLabelNormalize.ts ----

/** Lowercase, hyphen/underscore -> space, collapse whitespace. */
export function normalizePlaceLabel(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_‐‑‒–—−]+/g, "-")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Letters+digits only -- for equality that ignores spaces, hyphens, apostrophes, periods. */
export function compactPlaceLabel(value: string): string {
  return normalizePlaceLabel(value).replace(/[^a-z0-9]/g, "");
}

/** Small Levenshtein distance -- used for light fuzzy match on boroughs and closed neighborhood lists. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/** Pick the canonical string from `candidates` that matches `raw` under general rules. */
export function matchCanonicalPlaceLabel(raw: string, candidates: readonly string[]): string | null {
  const needleNorm = normalizePlaceLabel(raw);
  const needleCompact = compactPlaceLabel(raw);
  if (!needleNorm) return null;
  for (const candidate of candidates) {
    if (normalizePlaceLabel(candidate) === needleNorm) return candidate;
  }
  for (const candidate of candidates) {
    if (compactPlaceLabel(candidate) === needleCompact) return candidate;
  }
  if (needleCompact.length >= 6) {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const candidate of candidates) {
      const d = editDistance(needleCompact, compactPlaceLabel(candidate));
      if (d > 0 && d <= 2 && d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
    if (best) return best;
  }
  return null;
}

// ---- locations.ts (NYC) ----

export const BOROUGHS: Borough[] = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

export const NEIGHBORHOODS: Record<Borough, string[]> = {
  Manhattan: [
    "Upper West Side", "Upper East Side", "Chelsea", "Harlem", "SoHo", "Tribeca", "Flatiron",
    "Financial District", "Battery Park City", "Civic Center", "Two Bridges", "Lower East Side",
    "East Village", "Greenwich Village", "West Village", "NoHo", "Nolita", "Little Italy", "Chinatown",
    "Meatpacking District", "Gramercy", "Gramercy Park", "Murray Hill", "Kips Bay", "Rose Hill", "NoMad",
    "Stuyvesant Town", "Midtown", "Midtown East", "Midtown West", "Hell's Kitchen", "Times Square",
    "Theater District", "Hudson Yards", "Koreatown", "Turtle Bay", "Sutton Place", "Lenox Hill",
    "Lincoln Square", "Carnegie Hill", "Morningside Heights", "Manhattanville", "Hamilton Heights",
    "Sugar Hill", "Washington Heights", "Hudson Heights", "Inwood", "Roosevelt Island", "Marble Hill",
  ],
  Brooklyn: [
    "Brooklyn Heights", "DUMBO", "Williamsburg", "Greenpoint", "Bushwick", "Bedford-Stuyvesant",
    "Crown Heights", "Prospect Heights", "Marine Park", "Park Slope", "Carroll Gardens", "Cobble Hill",
    "Fort Greene", "Sunset Park", "Bay Ridge", "Downtown Brooklyn", "Boerum Hill", "Gowanus", "Red Hook",
    "Vinegar Hill", "Clinton Hill", "East Williamsburg", "Prospect Lefferts Gardens", "Windsor Terrace",
    "Kensington", "Ditmas Park", "Flatbush", "East Flatbush", "Midwood", "Borough Park", "Dyker Heights",
    "Bensonhurst", "Bath Beach", "Gravesend", "Sheepshead Bay", "Brighton Beach", "Manhattan Beach",
    "Coney Island", "Canarsie", "Mill Basin", "Bergen Beach", "Brownsville", "East New York",
    "Cypress Hills", "Fort Hamilton", "Prospect Park South", "Ocean Hill", "Stuyvesant Heights",
    "Navy Yard", "Columbia Street Waterfront",
  ],
  Queens: [
    "Astoria", "Long Island City", "Sunnyside", "Woodside", "Jackson Heights", "Elmhurst", "Corona",
    "Flushing", "Forest Hills", "Jamaica", "Ridgewood", "Bayside", "Ditmars Steinway", "East Elmhurst",
    "Maspeth", "Middle Village", "Glendale", "Rego Park", "Kew Gardens", "Kew Gardens Hills", "Briarwood",
    "Richmond Hill", "South Richmond Hill", "Ozone Park", "Howard Beach", "Woodhaven", "Whitestone",
    "College Point", "Fresh Meadows", "Bellerose", "Floral Park", "Glen Oaks", "Douglaston",
    "Little Neck", "Auburndale", "Murray Hill", "Jamaica Estates", "Hillcrest", "Hollis",
    "Queens Village", "Cambria Heights", "Laurelton", "Rosedale", "Springfield Gardens", "St. Albans",
    "Far Rockaway", "Rockaway Beach", "Rockaway Park", "Arverne", "Broad Channel", "Sunnyside Gardens",
  ],
  Bronx: [
    "Mott Haven", "Hunts Point", "Concourse", "Highbridge", "Fordham", "Kingsbridge", "Riverdale",
    "Pelham Bay", "Morris Park", "Throgs Neck", "Melrose", "Morrisania", "Tremont", "East Tremont",
    "West Farms", "Belmont", "Soundview", "Castle Hill", "Parkchester", "Westchester Square",
    "Country Club", "City Island", "Co-op City", "Baychester", "Wakefield", "Williamsbridge", "Norwood",
    "Bedford Park", "University Heights", "Morris Heights", "Mount Hope", "Claremont", "Spuyten Duyvil",
    "Allerton", "Pelham Gardens", "Eastchester", "Van Nest", "Longwood", "Port Morris",
  ],
  "Staten Island": [
    "St. George", "Stapleton", "New Dorp", "Great Kills", "Annadale", "Tottenville", "Westerleigh",
    "Port Richmond", "Tompkinsville", "Clifton", "Rosebank", "Grymes Hill", "West Brighton",
    "Livingston", "Mariners Harbor", "Bulls Head", "New Springville", "Willowbrook", "Todt Hill",
    "Dongan Hills", "Grant City", "Midland Beach", "South Beach", "Oakwood", "Eltingville",
    "Arden Heights", "Huguenot", "Prince's Bay", "Charleston", "Rossville", "Woodrow",
    "Pleasant Plains", "Richmond", "Castleton Corners", "Concord", "Emerson Hill", "New Brighton",
  ],
};

const STATIC_NEIGHBORHOOD_ALIASES: Record<string, Partial<Record<Borough, string>>> = {
  "east harlem": { Manhattan: "Harlem" },
  "central harlem": { Manhattan: "Harlem" },
  "west harlem": { Manhattan: "Harlem" },
  "sugar hill": { Manhattan: "Harlem" },
  manhattanville: { Manhattan: "Harlem" },
  "hamilton heights": { Manhattan: "Harlem" },
  "morningside heights": { Manhattan: "Harlem" },
  yorkville: { Manhattan: "Upper East Side" },
  "carnegie hill": { Manhattan: "Upper East Side" },
  "lenox hill": { Manhattan: "Upper East Side" },
  "sutton place": { Manhattan: "Upper East Side" },
  "lincoln square": { Manhattan: "Upper West Side" },
  "midtown east": { Manhattan: "Midtown" },
  "midtown west": { Manhattan: "Midtown" },
  "theater district": { Manhattan: "Midtown" },
  "times square": { Manhattan: "Midtown" },
  "hells kitchen": { Manhattan: "Midtown" },
  "west village": { Manhattan: "Greenwich Village" },
  "battery park city": { Manhattan: "Financial District" },
  "civic center": { Manhattan: "Tribeca" },
  "prospect park": { Brooklyn: "Prospect Heights" },
  "prospect park south": { Brooklyn: "Prospect Heights" },
};

function applyStaticAlias(borough: Borough, cleanedKey: string): string {
  const key = cleanedKey.replace(/'/g, "");
  const target = STATIC_NEIGHBORHOOD_ALIASES[key]?.[borough];
  return target ? normalizePlaceLabel(target) : cleanedKey;
}

// ---- Real neighbourhood vs display group (owner directive, 2026-08-08) ----
//
// "I want the real neighbourhoods and boroughs for every single listing, there is a grouping rule how
// the page shows it but we have to use the real neighbourhoods on the cards."
//
// `STATIC_NEIGHBORHOOD_ALIASES` above IS that grouping rule, and it was already here -- East Harlem,
// Central Harlem, West Harlem, Sugar Hill, Manhattanville, Hamilton Heights and Morningside Heights all
// roll up to "Harlem"; Yorkville, Carnegie Hill, Lenox Hill and Sutton Place to "Upper East Side";
// Battery Park City to "Financial District"; West Village to "Greenwich Village".
//
// The defect was that `findCanonicalNeighborhood` is the ONLY canonicalizer, and it always folds. So a
// reviewer who established that a listing is in Carnegie Hill had nowhere to put that: canonicalizing it
// returned "Upper East Side", and writing the folded value threw the finding away. A family looking at
// the card then reads a neighbourhood a full mile from the door they are walking to.
//
// So the two operations are now separate. `findRealNeighborhood` canonicalizes SPELLING without folding
// -- that is what a card stores. `neighborhoodGroup` folds -- that is how the page groups. The page's
// behaviour is unchanged; what changes is that the precise answer survives being written down.

/**
 * Real neighbourhood names that the main app's group vocabulary does not carry.
 *
 * Deliberately kept OUT of `NEIGHBORHOODS`, which is a faithful port and must stay one: mixing this
 * repo's additions into the ported array is exactly how a hand-synced copy goes stale invisibly. These
 * are additive and each already has a fold target in `STATIC_NEIGHBORHOOD_ALIASES`, so the page groups
 * them correctly the moment a card starts carrying one.
 */
export const REAL_NEIGHBORHOODS_EXTRA: Partial<Record<Borough, string[]>> = {
  Manhattan: ["East Harlem", "Central Harlem", "West Harlem", "Yorkville"],
  // A large park is not usually a neighbourhood, and most (Central Park, Brooklyn Bridge Park, Floyd
  // Bennett Field) are deliberately NOT here -- they straddle several and have no fold target, so storing
  // one would be a precise-sounding answer to a question the data cannot settle. Prospect Park is the
  // exception the alias table already made: it folds to Prospect Heights. For the LeFrak Center at
  // Lakeside, which is physically inside the park, "Prospect Park" is the real answer AND groups
  // correctly -- strictly better for a family than the fold target it used to store.
  Brooklyn: ["Prospect Park"],
};

/**
 * NYC neighbourhoods the ported registry omits, by borough.
 *
 * Deliberately SHORT. The ported NYC lists are already thorough — 49 Manhattan entries, 51 Queens, 50
 * Brooklyn — and every one of these was added because a live record needed it or because its absence was
 * plainly a hole rather than a judgement call. This is separate from `REAL_NEIGHBORHOODS_EXTRA` in
 * `locations.ts`, which exists for a different reason: those are real names the GROUP vocabulary folds
 * away (East Harlem into Harlem), whereas these are simply missing.
 */
export const NYC_NEIGHBORHOODS_EXTRA: Record<string, string[]> = {
  Brooklyn: ["South Slope", "Greenwood Heights", "Weeksville", "Starrett City", "Bath Beach", "Sea Gate"],
  Queens: ["Rockaway Park", "Belle Harbor", "Neponsit", "Utopia", "Pomonok", "Lefrak City", "Bayswater"],
  Bronx: [
    "Bedford Park", "Fieldston", "North Riverdale", "Van Cortlandt Village", "Woodlawn", "Norwood",
    "Mott Haven", "Clason Point", "Edgewater Park", "Schuylerville", "Unionport",
  ],
  "Staten Island": ["Randall Manor", "Silver Lake", "Sunnyside", "Bay Terrace", "Great Kills", "Travis"],
  Manhattan: ["Bowery", "Alphabet City", "Lenox Hill", "Tudor City", "Hudson Square", "Lincoln Center"],
};

/** Every name a card may legitimately store: the ported group vocabulary plus the real names above. */
export const REAL_NEIGHBORHOODS: Record<Borough, string[]> = BOROUGHS.reduce((acc, b) => {
  acc[b] = [
    ...(NEIGHBORHOODS[b] ?? []),
    ...(REAL_NEIGHBORHOODS_EXTRA[b] ?? []),
    // Owner directive 2026-08-09: real NYC neighbourhoods the ported list simply omits. See
    // NYC_NEIGHBORHOODS_EXTRA below for why these are separate from REAL_NEIGHBORHOODS_EXTRA -- those
    // are names the GROUP vocabulary folds away, these are names it never had.
    ...(NYC_NEIGHBORHOODS_EXTRA[b] ?? []),
  ];
  return acc;
}, {} as Record<Borough, string[]>);

/**
 * Canonicalize a neighbourhood's SPELLING without rolling it up to its display group.
 *
 * This is what belongs in `providers.neighborhood` / `contentCards.neighborhoodGuess`: the place the
 * child actually goes. "carnegie hill" -> "Carnegie Hill", not "Upper East Side".
 *
 * Returns null for anything not recognised, including a compound -- a compound is rejected at write time
 * anyway and usually hides a split candidate, so quietly resolving it to its first segment (which
 * `findCanonicalNeighborhood` does, correctly, for GROUPING a legacy value) would launder it here.
 */
export function findRealNeighborhood(
  borough: Borough | null | undefined,
  value: string | null | undefined,
): string | null {
  if (!borough) return null;
  const raw = String(value ?? "").trim();
  if (!raw || /[/;|]/.test(raw)) return null;
  const list = REAL_NEIGHBORHOODS[borough] ?? [];
  return matchCanonicalPlaceLabel(raw, list) ?? matchCanonicalPlaceLabel(normalizePlaceLabel(raw), list);
}

/**
 * The label the page groups a real neighbourhood under — the fold, made explicit and callable.
 *
 * Falls back to the neighbourhood itself when it is not an alias, because most neighbourhoods are their
 * own group. Returns null only when the value is not a recognised place at all.
 */
export function neighborhoodGroup(
  borough: Borough | null | undefined,
  value: string | null | undefined,
): string | null {
  if (!borough) return null;
  const real = findRealNeighborhood(borough, value);
  if (!real) return findCanonicalNeighborhood(borough, value);
  const folded = applyStaticAlias(borough, normalizePlaceLabel(real));
  return matchCanonicalPlaceLabel(folded, NEIGHBORHOODS[borough] ?? []) ?? real;
}

/**
 * Resolve a free-text borough label to its canonical `Borough`, or null.
 * Rules: exact (case-insensitive) -> compact match -> county aliases -> edit distance <= 2 against the
 * 5 boroughs. Multi-borough or "NYC" -> null.
 */
export function findCanonicalBorough(value: string | null | undefined): Borough | null {
  const cleaned = normalizePlaceLabel(String(value ?? ""));
  if (!cleaned) return null;
  const exact = BOROUGHS.find((b) => normalizePlaceLabel(b) === cleaned);
  if (exact) return exact;
  const compact = compactPlaceLabel(cleaned);
  const byCompact = BOROUGHS.find((b) => compactPlaceLabel(b) === compact);
  if (byCompact) return byCompact;
  if (cleaned === "new york county") return "Manhattan";
  if (cleaned === "kings county") return "Brooklyn";
  if (cleaned === "queens county") return "Queens";
  if (cleaned === "bronx county") return "Bronx";
  if (cleaned === "richmond county") return "Staten Island";

  let best: Borough | null = null;
  let bestDist = Infinity;
  for (const b of BOROUGHS) {
    const d = editDistance(compact, compactPlaceLabel(b));
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best && bestDist > 0 && bestDist <= 2 ? best : null;
}

/**
 * Resolve a free-text neighborhood label to its canonical registry entry for a borough, or null.
 * Handles slash/semicolon combos ("Harlem / Upper West Side") by resolving the first matching segment.
 */
export function findCanonicalNeighborhood(
  borough: Borough | null | undefined,
  value: string | null | undefined,
): string | null {
  if (!borough) return null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/[/;|]/.test(raw)) {
    const parts = raw.split(/[/;|]/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const hit = findCanonicalNeighborhood(borough, part);
      if (hit) return hit;
    }
  }

  let cleaned = normalizePlaceLabel(raw);
  cleaned = applyStaticAlias(borough, cleaned);

  const list = NEIGHBORHOODS[borough] ?? [];

  const absorbedHit = matchCanonicalPlaceLabel(cleaned, list);
  if (absorbedHit) return absorbedHit;

  const directHit = matchCanonicalPlaceLabel(raw, list);
  if (directHit) {
    const folded = applyStaticAlias(borough, normalizePlaceLabel(directHit));
    return matchCanonicalPlaceLabel(folded, list) ?? directHit;
  }

  const MIN_QUERY_LENGTH_FOR_NAME_CONTAINS_QUERY = 4;
  const cleanedCompactLength = compactPlaceLabel(cleaned).length;
  let best: string | null = null;
  let bestLength = -1;
  for (const neighborhood of list) {
    const normalized = normalizePlaceLabel(neighborhood);
    const queryContainsName = cleaned.includes(normalized);
    const nameContainsQuery = cleanedCompactLength >= MIN_QUERY_LENGTH_FOR_NAME_CONTAINS_QUERY && normalized.includes(cleaned);
    if ((queryContainsName || nameContainsQuery) && normalized.length > bestLength) {
      best = neighborhood;
      bestLength = normalized.length;
    }
  }
  if (!best) return null;
  const foldedBest = applyStaticAlias(borough, normalizePlaceLabel(best));
  return matchCanonicalPlaceLabel(foldedBest, list) ?? best;
}

// ---------------------------------------------------------------------------------------------------
// Gaps in the two ported city vocabularies (owner directive, 2026-08-09)
//
// "You have the right to finetune borough (district) and neighbourhood for any city, never made up
// always confirm... The core system will filter out anyway."
//
// Kept in their own EXTRA constants and merged only into the REAL_* / resolver paths, never into
// NEIGHBORHOODS or LA_AREAS themselves -- those are hand-synced copies of the main app's data, and this
// repo has already recorded that mixing additions into a ported array is how such a copy goes stale
// invisibly. Same pattern as REAL_NEIGHBORHOODS_EXTRA above.
//
// Every entry is geography, not judgement: a real named district, town or incorporated city. Adding
// "La Canada Flintridge" to San Gabriel Valley asserts a fact about a map, not a claim about a business.
// ---------------------------------------------------------------------------------------------------

/**
 * LA areas the ported `LA_AREAS` omits.
 *
 * South Los Angeles is a large, well-defined part of the city with real children's programmes in it, and
 * its absence forced at least one real listing (Lula Washington Dance Theatre, 3773 Crenshaw Blvd) into
 * "Central LA" with an empty neighbourhood.
 */
export const LA_AREAS_EXTRA: string[] = ["South LA"];

/**
 * LA neighbourhoods missing from the ported registry, by area.
 *
 * Each entry is a real, named Los Angeles district or incorporated city within that area. The three that
 * blocked live listings are marked; the rest fill obvious holes in the same areas so the next record does
 * not hit the same wall.
 */
export const LA_NEIGHBORHOODS_EXTRA: Record<string, string[]> = {
  // The new area. Lula Washington Dance Theatre is on Crenshaw Blvd.
  "South LA": [
    "Crenshaw", "Leimert Park", "Baldwin Hills", "Baldwin Village", "View Park-Windsor Hills",
    "West Adams", "Jefferson Park", "Adams-Normandie", "Exposition Park", "University Park",
    "Vermont Square", "Vermont-Slauson", "Hyde Park", "Harvard Park", "South Park", "Watts",
    "Florence", "Green Meadows", "Historic South-Central", "Central-Alameda", "Broadway-Manchester",
    "Manchester Square", "Chesterfield Square", "Ladera Heights",
  ],
  // Del Rey blocked Broadway Gymnastics School, 5433 Beethoven Street.
  Westside: [
    "Del Rey", "Sawtelle", "Rancho Park", "Cheviot Hills", "Beverlywood", "Bel Air", "Malibu",
    "Topanga", "Westchester", "Playa del Rey", "Ladera Heights",
  ],
  // La Cañada Flintridge blocked Descanso Gardens, 1418 Descanso Drive.
  "San Gabriel Valley": [
    "La Cañada Flintridge", "Altadena", "Azusa", "Baldwin Park", "Claremont", "Diamond Bar",
    "El Monte", "South El Monte", "Industry", "La Puente", "La Verne", "Pomona", "San Dimas",
    "Walnut", "Hacienda Heights", "Rowland Heights",
  ],
  "Central LA": [
    "Chinatown", "Little Tokyo", "Arts District", "Fairfax", "Beverly Grove", "Miracle Mile",
    "Pico-Union", "Historic Filipinotown", "Elysian Park", "Angelino Heights", "Rampart Village",
    "Harvard Heights", "Windsor Square", "Melrose",
  ],
  "San Fernando Valley": [
    "Calabasas", "Sun Valley", "Pacoima", "Sylmar", "Mission Hills", "Panorama City", "Winnetka",
    "West Hills", "Porter Ranch", "Arleta", "Lake Balboa", "Valley Village", "Valley Glen",
    "Tujunga", "Sunland", "Shadow Hills", "Chatsworth",
  ],
  Eastside: ["Cypress Park", "Glassell Park", "Elysian Valley", "University Hills"],
  "South Bay": [
    "Rancho Palos Verdes", "Rolling Hills Estates", "Rolling Hills", "Palos Verdes Peninsula", "Lomita",
  ],
  "Gateway Cities": [
    "Compton", "Lynwood", "South Gate", "Huntington Park", "Bell", "Bell Gardens", "Cudahy", "Maywood",
    "Signal Hill", "Artesia", "Hawaiian Gardens", "Santa Fe Springs", "Commerce", "Vernon", "Lakewood",
  ],
  Harbor: ["Terminal Island"],
};



// ---- laLocations.ts ----

export const LA_AREAS: string[] = [
  "Central LA", "Westside", "San Fernando Valley", "San Gabriel Valley", "South Bay",
  "Gateway Cities", "Eastside", "Harbor", "Santa Clarita Valley", "Antelope Valley",
];

export const LA_NEIGHBORHOODS: Record<string, string[]> = {
  "Central LA": [
    "Downtown", "Hollywood", "East Hollywood", "Silver Lake", "Los Feliz", "Echo Park", "Koreatown",
    "Mid-Wilshire", "Hancock Park", "Larchmont", "West Hollywood", "Westlake", "Mid-City",
  ],
  Westside: [
    "Santa Monica", "Venice", "Mar Vista", "Culver City", "Brentwood", "West Los Angeles", "Westwood",
    "Palms", "Marina del Rey", "Pacific Palisades", "Playa Vista", "Playa del Rey", "Beverly Hills",
    "Century City",
  ],
  "San Fernando Valley": [
    "Burbank", "Glendale", "Studio City", "Sherman Oaks", "Encino", "Van Nuys", "North Hollywood",
    "Woodland Hills", "Tarzana", "Northridge", "Reseda", "Toluca Lake", "Granada Hills", "Chatsworth",
    "Canoga Park",
  ],
  "San Gabriel Valley": [
    "Pasadena", "South Pasadena", "Alhambra", "Arcadia", "Monrovia", "San Gabriel", "Temple City",
    "San Marino", "Glendora", "Covina", "West Covina", "Monterey Park", "Rosemead", "Sierra Madre",
    "Duarte",
  ],
  "South Bay": [
    "Torrance", "Redondo Beach", "Manhattan Beach", "Hermosa Beach", "El Segundo", "Hawthorne",
    "Gardena", "Carson", "Palos Verdes Estates", "Inglewood", "Lawndale",
  ],
  "Gateway Cities": [
    "Long Beach", "Downey", "Norwalk", "Whittier", "Bellflower", "Cerritos", "Lakewood", "Paramount",
    "Pico Rivera", "Montebello", "La Mirada",
  ],
  Eastside: [
    "Highland Park", "Eagle Rock", "Boyle Heights", "El Sereno", "Lincoln Heights", "Mount Washington",
    "Atwater Village", "Montecito Heights",
  ],
  Harbor: ["San Pedro", "Wilmington", "Harbor City", "Harbor Gateway"],
  "Santa Clarita Valley": ["Santa Clarita", "Valencia", "Newhall", "Saugus", "Stevenson Ranch", "Canyon Country"],
  "Antelope Valley": ["Lancaster", "Palmdale", "Quartz Hill"],
};

/**
 * NOT a port -- no LA equivalent of `findCanonicalBorough` exists in the main repo. Exact/compact
 * match only against the closed `LA_AREAS` list, mirroring the level of tolerance the main app
 * actually applies to LA geography (no edit-distance typo tolerance there either).
 */
export function findCanonicalArea(value: string | null | undefined): string | null {
  const cleaned = normalizePlaceLabel(String(value ?? ""));
  if (!cleaned) return null;
  return matchCanonicalPlaceLabel(cleaned, ALL_LA_AREAS);
}

/** The ported LA areas plus this repo's own additions. See LA_AREAS_EXTRA. */
export const ALL_LA_AREAS: string[] = [...LA_AREAS, ...LA_AREAS_EXTRA];

/** One area's neighbourhoods: the ported list plus this repo's own additions. */
export function laNeighborhoodsFor(area: string): string[] {
  return [...(LA_NEIGHBORHOODS[area] ?? []), ...(LA_NEIGHBORHOODS_EXTRA[area] ?? [])];
}

/**
 * NOT a port -- no LA equivalent of `findCanonicalNeighborhood` exists in the main repo. Same
 * exact/compact/containment engine, scoped to one area's neighborhood list, no alias map (none
 * exists for LA to port).
 */
export function findCanonicalLANeighborhood(area: string | null | undefined, value: string | null | undefined): string | null {
  if (!area) return null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return matchCanonicalPlaceLabel(raw, laNeighborhoodsFor(area));
}

// ---- Combined NYC+LA resolver (this repo's own convenience wrapper) ----

export interface ResolvedRegion {
  /** Canonical NYC borough or LA area, or "(unresolved)" when neither registry matches. */
  region: string;
  /** Canonical neighborhood under `region`, or "(unresolved)" when `region` itself is unresolved or
   *  the neighborhood value doesn't match anything in that region's list. */
  neighborhood: string;
}

/** Tries NYC boroughs first, then LA areas -- the two canonical sets never collide in practice, so
 *  this needs no `city` field to pick the right one. */
export function resolveRegionAndNeighborhood(rawRegion: string | null | undefined, rawNeighborhood: string | null | undefined): ResolvedRegion {
  const nycBorough = findCanonicalBorough(rawRegion);
  if (nycBorough) {
    return { region: nycBorough, neighborhood: findCanonicalNeighborhood(nycBorough, rawNeighborhood) ?? "(unresolved)" };
  }
  const laArea = findCanonicalArea(rawRegion);
  if (laArea) {
    return { region: laArea, neighborhood: findCanonicalLANeighborhood(laArea, rawNeighborhood) ?? "(unresolved)" };
  }
  return { region: "(unresolved)", neighborhood: "(unresolved)" };
}
