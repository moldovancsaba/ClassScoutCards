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

## SerpAPI (added 2026-08-09, owner-provided key)

The owner supplied a SerpAPI key the same day this registry was written, closing the "no structured
Google data" gap. `src/scripts/serp.py` is the only sanctioned caller — it enforces the budget
discipline the free plan makes mandatory (**250 searches/month, hard**): every call logged to a ledger,
a 25-call reserve kept for maintenance emergencies, and a standing rule that no search is spent on what
a free tier answers. The key lives in `.env.local` (gitignored), never in the repo.

What its first two calls bought, as calibration: 40 structured places (name, full address, phone, type,
gps, place_id, rating, operating hours), among them **New Generation School of Martial Arts, 395 Maple
St, 11225** — a Prospect Lefferts Gardens venue no other tier had found — and a **fourth operator at the
Major Owens Center** (Globall Sports Centers), plus the fact that BKLA's swim academy runs at the
Bedford-Union Armory pool rather than its Powell Street site. And one noise specimen worth remembering:
a Sterling, Virginia gym returned inside a Brooklyn-centred search. The entity and geo checks are not
optional for this tier either.

Its unique maintenance value: results carry **"Permanently closed"** markers, so a neighbourhood
re-scan doubles as a closure sweep — pending the Yelp Fusion key (owner ask still open), which would
take that load off the 250/month budget entirely at 5,000 free calls/day.

## Yelp Fusion (added 2026-08-09, owner-provided key) — owner ask #2 CLOSED

`src/scripts/yelp.py`. Free tier is 5,000 calls/day — for this catalogue, effectively unmetered. Two
modes, and the second is the bigger prize:

- **Discovery**: one radius call returns up to 50 structured places (name, address, phone, category
  aliases, coordinates). Its first PLG call added Rebel Fitness Bar (1196 Nostrand Ave, 11225),
  TNK-Jujitsu, All Sports For All People (883 Classon Ave, 11225) and a second Maple Street dojo — the
  PLG count keeps climbing with every tier added.
- **The automated closure sweep**: Fusion's `is_closed` field, joined to the pool by PHONE — the
  catalogue already normalises phones to digits as its cheapest duplicate key, and the same digits are
  Yelp's `/businesses/search/phone` join key. The entire ~1,100-listing live pool can be closure-checked
  weekly in a fraction of one day's budget. `is_closed=True` is a LEAD for the human closure check
  (Yelp mis-marks businesses too), never an automatic quarantine — but it turns "which listings should
  this week's maintenance look at" from guesswork into a list. Verified live on Prospect Gymnastics and
  Oishi Judo (both open, both correct).

Noise profile, measured on the first call: Yelp pads thin radii with out-of-area results (a Bronx swim
instructor and a Long Beach gym appeared inside a 1.2 km PLG search) and lists home-based instructors
with no venue — exactly the no-fixed-venue shape this catalogue prohibits. `row()` flags results with
no street address; the operator-site check stays mandatory.

Remaining owner ask: the **DOHMH children's camp permit roll** (311/FOIL) — still the only census-grade
camp source there is.

## Owner-verified spreadsheets (tier added 2026-08-09)

The owner supplies hand-verified provider spreadsheets ("NEXT 20 verified local sport providers",
2026-08-09: borough, neighbourhood, address, qualifying youth sport, official URL, evidence URL). Parsed
and cross-checked against the pool on receipt — **9 of the 20 are not yet in the catalogue** and now sit
at the top of the create queue (`src/scripts/ownerVerifiedQueue.json`). Highest-trust discovery tier,
and still verified per candidate before create: the first such spreadsheet contained 7 venues that
already had live records, and acting on it unchecked would have created 7 duplicates.

## The DOHMH camp census — owner ask #1 CLOSED, no FOIL needed (2026-08-09)

The permit roll was on NYC Open Data all along, hiding inside a dataset whose TITLE says nothing about
camps: **DOHMH Childcare Center Inspections** (`dsg6-ifza`) carries `childcaretype = "Camp"` — 1,431
inspection records collapsing to **341 distinct permitted camp sites** (Brooklyn 105, Manhattan 99,
Queens 95, Staten Island 22, Bronx 20), each with name, building + street, borough, ZIP and phone.
Extract saved to `src/scripts/dohmhPermittedCamps.json`.

- Dataset: https://data.cityofnewyork.us/Health/DOHMH-Childcare-Center-Inspections-Historical-/dsg6-ifza
- API: `https://data.cityofnewyork.us/resource/dsg6-ifza.json?childcaretype=Camp`

**Lesson recorded**: two catalog searches for "camp" missed this because they searched dataset TITLES.
Search the column values of adjacent datasets before concluding a public record does not exist. And the
census is of *legally permitted day camps*, not sport camps — the sport filter and the entity check
still run per candidate.

## The first Yelp closure census (2026-08-09) — a real negative result, and three matcher bugs found

`src/scripts/closureSweep.py`, promised in the registry's Yelp Fusion entry, run for the first time
against the WHOLE live pool with a phone (587 of 587, not a sample) — cheap on the 5,000-call/day budget.
**Result: zero genuine closures.** Getting to that honest zero took three rounds of fixing the tool's own
false-positive shapes, each worth keeping because each will recur:

1. **Shared phone, different address.** An operator running several locations can reuse one phone number
   across separate Yelp listings — The Tiny Scientist's Brooklyn number matched two OTHER, unrelated
   addresses marked closed. Fixed by requiring the closed result's address to match the stored record's.
2. **Same address, different name — a relocation.** Staten Island Museum's phone matched both its old
   downtown listing (75 Stuyvesant Pl, closed) and its current Snug Harbor listing (1000 Richmond Ter,
   open) — same phone, same ZIP, different STREET. Matching on ZIP alone let the old address through;
   fixed to require street-level agreement.
3. **Same address, different name — a rebrand.** Clayhouse Brooklyn's address and phone exactly match a
   closed "The Painted Pot" listing at the same door — the shop renamed, and Yelp kept the old brand's
   listing marked closed. Not evidence the current business is closed.
4. **A seasonal sub-event whose name contains the venue's name.** New York Botanical Garden's phone
   matched a closed "Haunted Pumpkin Garden - New York Botanical Garden" listing — a past Halloween
   event, not the venue, closed because the SEASON ended. Plain substring containment let this through;
   fixed to require the shorter name cover at least 70% of the longer one's length.

**The general lesson, stated once for the next tool built on a join key:** a phone number, an address and
a name are each individually weak evidence of "same specific listing" — chains share phones, businesses
move and rename, and event sub-pages borrow a venue's name. Cross-referencing two of the three (address
+ name, here) is what a lookup-by-shared-key needs before its result can be trusted; matching on the key
alone produced a false positive in every one of the first five hits before the fix.

**A negative result is worth stating loudly precisely because it is a census, not a sample** — the
distinction this repo has recorded twice before as a mistake to avoid repeating.
