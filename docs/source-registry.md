# The source registry — how this catalogue discovers, enriches and maintains listings

Owner directive, 2026-08-09: *"build a proper list of sources that we will improve and update always
every day and that can serve us not only for discovering but enriching and maintaining existing
listings."* This document is that list's human half; `src/scripts/sourceRegistry.json` is the
machine-readable half the tooling reads. **Both carry a `lastVerified` date per source — the day the
source was last actually exercised from this environment.** Reachability here is a fact about the egress
proxy as much as about the source, so a status nobody has exercised in two weeks is a claim, not a fact.

## Why the approach changed (2026-08-09)

The per-neighbourhood Overpass sweep reported that Prospect Lefferts Gardens — ~60,000 residents —
contains three children's sport venues, and that number was written up as "the neighbourhood's ceiling,
measurable rather than an opinion." **That was wrong, and wrong in an instructive way: it measured
OpenStreetMap's coverage and called the result reality.** A second-floor karate school, a
church-basement dance program, a booking-platform-only operator or a program running inside a shared
building never gets an OSM tag. One hour of testing other tiers surfaced, inside or on the edge of that
same neighbourhood: Discovery Kids (448 Rogers Ave), Pixie Pods (448 Rogers Ave), Collective Kind
(511 Rogers Ave), Brooklyn Trails (Prospect Park at Lincoln Rd), and the Major Owens Center at
1561 Bedford Ave — one building where **three separate operators** (New Heights basketball, Imagine
Swimming, Asphalt Green turf field) run children's programs. The OSM sweep counted that building as one
venue.

The standing rule this produces: **a single source's count is never a neighbourhood ceiling.** A
neighbourhood is "thin" only when the FULL stack below has been run against it and the results
reconciled — and even then the finding is "these sources see N", recorded with the source list attached.

## The stack, in the order a neighbourhood round runs it

Every round works one neighbourhood, defined by its **NTA 2020 polygon** (NYC Open Data `9nt8-h7nd`,
GeoJSON, free) — never by a Nominatim bounding box. The bounding boxes overlap so badly in Manhattan
that six micro-neighbourhoods return the same rectangle; the polygons are the real boundaries and they
also retire the "is this pin inside the neighbourhood" ambiguity in `inZeroNeighborhood.py`.

| # | Tier | What it yields | Role |
|---|------|----------------|------|
| 1 | **City data** — Socrata datasets (rec centers, athletic facilities), NYC Parks pages | public venues, with the closure banners that are the maintenance signal | discover + maintain |
| 2 | **Index mining** — WebSearch scoped with `allowed_domains` to yelp.com / hisawyer.com / classpass.com, per sport category | the walled-directory tier without touching the walls: Yelp titles carry `NAME - ADDRESS - phone`, Sawyer titles carry `NAME - ADDRESS - NEIGHBORHOOD` | discover |
| 3 | **Overpass/OSM** | mapped storefront venues (sparse — see registry notes) | discover |
| 4 | **Franchise locators** — every multi-site operator already known | per-branch address+phone in one request; a branch vanishing from its own chain's list is the strongest closure signal there is | discover + enrich + maintain |
| 5 | **Shared-venue tenant expansion** — any multi-tenant building the round touches | one venue → several operator listings (Major Owens = 3) | discover |
| 6 | **Parent directories** — Mommy Poppins / Macaroni KID / Brooklyn Bridge Parents camp guides | seasonal camp operators with addresses; date-check every article | discover |
| 7 | **Operator's own site** | every field on the listing | enrich + verify — MANDATORY for anything the tiers above surfaced |

Nothing from tiers 1–6 is ever written without tier 7. The entity check, the children's-programme check
(47 BJJ Coop), the physical-location check and the lifecycle check (City Treehouse, Brownsville's closed
pool) all still run per candidate — the stack changes where leads COME FROM, not what it takes to
become a listing.

### Index-mining query templates

Per neighbourhood N and borough B, run with `allowed_domains` as noted:

- `kids classes OR camps "N" OR "ZIP" B dance karate swim soccer gymnastics` → `hisawyer.com`
- `"B, NY ZIP" OR "N" kids karate OR taekwondo OR swim OR basketball academy studio` → `yelp.com`
- `"N" kids sports class camp B ZIP` → `mommypoppins.com, macaronikid.com, brooklynbridgeparents.com, newyorkfamily.com`

Mine the result TITLES first — they carry the address — and treat the answer text as a summary of
unread pages, not as verification. (A search summary asserted Prospect Gymnastics PLG exists at
535 Rogers Ave; the operator's own contact page shows two gyms and `/plg/` 404s. The summary repeats a
stale 2019 press article to this day. Tier 7 exists because of exactly this.)

## The daily update ritual

The registry serves maintenance only if it is exercised on a cycle, not once:

1. **Daily** — Socrata delta check: `dataUpdatedAt` on the tracked dataset ids; NYC Parks events feed
   (`w3wp-dpdi`) for program activity. Cheap: two requests.
2. **Weekly** — re-fetch the NYC Parks rec-center directory and diff the closure banners; re-run the
   defect-cohort scans that feed the queue.
3. **Rolling ~30 days** — re-fetch every live listing's `website` (operator sites tier); diff
   address/phone/schedule blocks; farewell-message grep on changed pages. A chain's locator page
   re-fetch covers all its branches at once.
4. **Per round** — the neighbourhood stack above, for whichever neighbourhood the scarcity queue says
   is next.
5. **On every exercise** — stamp `lastVerified` in `sourceRegistry.json`. A source stale for 14+ days
   gets re-probed before its status is believed.

## What is blocked or missing, stated so nobody rediscovers it

- **Headless browser scraping is BLOCKED in this environment.** Chromium cannot CONNECT through the
  egress proxy — `ERR_CONNECTION_RESET` on every site including example.com, with the proxy configured
  and the CA trusted (verified 2026-08-09). Index mining substitutes.
- **Yelp/Sawyer/ClassPass direct fetches are bot-walled** to curl. Same substitute.
- **The NYS DOH children's camp permit roll is not published as a dataset** (searched
  data.cityofnewyork.us, health.data.ny.gov, data.ny.gov). Every legal NYC day camp holds a DOHMH
  permit, so the roll is a camp CENSUS — the highest-value single acquisition on this list.
  **Owner ask #1: request it via 311/FOIL.**
- **No Yelp Fusion or Google Places API key.** Yelp Fusion is free at 5,000 calls/day and returns
  structured `name/address/phone/categories/is_closed` — `is_closed` alone would automate the closure
  sweep that is currently manual judgement. **Owner ask #2: register a free Yelp Fusion key** (and/or
  Google Places, which has a monthly free tier). Either upgrade turns index mining from title-parsing
  into structured data, for discovery AND maintenance.
