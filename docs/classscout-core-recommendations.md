# Recommendations for the main `classscout` app (handoff, 2026-08-08)

This repo (`classscoutcards`) is a read/write bridge in front of the main app's database. Per
`CLAUDE.md`, the main `classscout` repo is **read-only from here** — when a defect's root cause lives
there, the deliverable is a written recommendation, not a commit.

Everything below was found by reviewing ~630 real card records through the bridge (batches 21–45 plus the
published sweep; see `card-improvement-process.md`). Each item says what was observed, how often, and
what the bridge could and could not do about it. The bridge has already fixed everything it has authority
over; these are the ones it structurally cannot.

Ordered by family impact, worst first.

---

## 0. Discovery picks a source by TOKEN-MATCHING the business name to an unrelated famous page  [NEW, HIGHEST]

**Found 2026-08-08 during the published-card sweep. 35 cards resolved, most of them `PUBLISHED` with zero
blockers, across three host families and one root cause.** This is the worst defect found in the entire
review effort, and the count kept growing every time another reference host was checked.

**The mechanism, confirmed precisely.** The `merriam-webster.com` cluster is the smoking gun — seven cards
sourced to **dictionary definitions of the first word of the business name**:

| Card | `sourceUrl` |
| --- | --- |
| **Sweet** Displays NYC | `merriam-webster.com/dictionary/sweet` |
| **Modern** Martial Arts NYC ×2 | `merriam-webster.com/dictionary/modern` |
| **Prospect** Gymnastics | `merriam-webster.com/dictionary/prospect` |
| **Field** House at Chelsea Piers | `merriam-webster.com/dictionary/field` |
| **Super** Soccer Stars UES | `merriam-webster.com/dictionary/super` |
| The **Little** Gym Upper Westside | `merriam-webster.com/dictionary/little` |

So this is not "sometimes matches a famous page". It is: **the first token of the business name is resolved
to whatever site ranks for that word** — a dictionary for common adjectives, Wikipedia for proper nouns,
`youtubekids.com` for "Kids", `nytimes.com` for "NY". One card, titled "Browse", took this to its
conclusion: the title was scraped from dictionary.com's own navigation chrome while the source was
`dictionary.com/browse/upper`, the entry for "upper", reached from the *neighborhood string* "Upper West
Side". Both halves of that card are artifacts of the same lookup.

The full spread, self-evidently absurd once you read the URL:

| Card title (all PUBLISHED, no blockers) | `sourceUrl` it was given | Matched on |
| --- | --- | --- |
| Tiger Schulmann's UWS / UES / Tiger Strong NYC | `en.wikipedia.org/wiki/Tiger` — **the animal** | "Tiger" |
| Marlene Meyerson JCC Manhattan Sports | `en.wikipedia.org/wiki/Marlene_Dietrich` — **the actress** | "Marlene" |
| Peter Stuyvesant Little League | `en.wikipedia.org/wiki/Saint_Peter` — **the apostle** | "Peter" |
| Asphalt Green Youth Tennis | `en.wikipedia.org/wiki/Asphalt_concrete` — **road surfacing** | "Asphalt" |
| Manhattan Soccer Club ×2, Manhattan Youth Tennis / Aquatics / Beach Volleyball / Downtown Community | `en.wikipedia.org/wiki/Manhattan` — **the borough article** | "Manhattan" |
| Downtown United Soccer Club, Downtown Little League | `en.wikipedia.org/wiki/Downtown` — **the concept** | "Downtown" |
| Dance Workshop NY | `en.wikipedia.org/wiki/Dance` — **the art form** | "Dance" |
| West Side YMCA | `en.wikipedia.org/wiki/West` — **the compass direction** | "West" |
| British Swim School Manhattan | `en.wikipedia.org/wiki/United_Kingdom` — **the country** | "British" |
| Kids in Sports UES / UWS, Kids Basketball NYC, Kids in the Game ×3 | `youtubekids.com` — **a video platform** | "Kids" |
| NY Sports 4 Kids, NY Kids Club UES / Chelsea | `nytimes.com` — **the newspaper homepage** | "NY" |

A family clicking "Asphalt Green Youth Tennis" today lands on the Wikipedia article for asphalt concrete.
A family clicking "Kids in Sports UES" lands on YouTube Kids.

**Why this is worse than it looks.** Most of these are *real businesses* — Tiger Schulmann's, the JCC,
Asphalt Green, Peter Stuyvesant Little League, Kids in Sports all exist. So nothing about the card's title,
category or borough looks wrong; every field reads as plausible. The only tell is the `sourceUrl`, which
nothing in the pipeline validates against the entity. And because the source is garbage, **every downstream
fact on the card is unevidenced** — the borough, the neighborhood, the category were all inferred from
nothing.

It also silently defeats the one heuristic that catches most other source defects. A reviewer checking
"is this host plausible?" sees `en.wikipedia.org` and `nytimes.com` — highly authoritative domains. One of
these cards was even graded `sourceAuthorityGrade: "authoritative"`.

**Recommendation.**
1. **Validate that the resolved source actually mentions the entity** before attaching it. A source page
   that does not contain the business name is not that business's source.
2. **Never resolve to a generic reference/platform host.** `en.wikipedia.org`, `youtubekids.com`,
   `nytimes.com` and equivalents should be hard-denied as `sourceUrl` for a local business card,
   independent of the token match — none of them is ever a children's activity provider's own site.
3. **A bare homepage of a national site is never valid evidence for a neighborhood-level claim.** Two of
   these were literally `https://www.nytimes.com/` and `https://www.youtubekids.com/`.
4. Audit for more — **the count grew every time another host was checked.** It went 3 (nytimes.com) → 15
   (+ wikipedia, youtubekids) → 25 once `en.wikipedia.org` was queried exhaustively rather than sampled.
   The sweep covered ~150 of 908 published cards, so there are very likely more in the unswept remainder
   and across the ~11,700 unpublished cards. Querying `sourceHost` against a denylist of reference and
   platform domains finds them in minutes — that query is the audit.

Also found live on the same principle, lower volume but same class: `amazon.com/gp/video/storefront/` for
"Léman Manhattan / Camp Léman"; a `youtube.com/watch?v=...` video for "Swim Urban Manhattan"; two
`facebook.com` pages for Long Island businesses; and — a different shape worth its own note — cards whose
title is *the directory's own brand name*, e.g. "Mommy Poppins — New York City" and "Time Out Los Angeles —
Kids". Those last two are the publication being ingested as if it were an activity provider.

**Bridge side already done:** all 15 resolved — real entities moved to `BLOCKED_REPAIRABLE` with the
correct re-source target recorded, duplicates and unidentifiable entities terminated. Note the bridge could
not actually *fix* them, only block them: `contentCards.sourceUrl` only became writable on 2026-08-08 and
is not yet deployed.

---

## 0b. The schema cannot hold what a parent actually decides on  [NEW, from the core listing-maintenance spec]

**Severity: highest by value. These are additive schema items, not bug fixes.**

The core system's own listing-maintenance spec asks reviewers to collect a set of fields that **have
nowhere to go in the current model**. Recording them here because the bridge repo can verify the demand
side — every one of these came up repeatedly in ~1,000 card reviews — but only the core app can add them.

**a) `price{}` with an evidence enum — the highest-value single item.** The spec reports **97.3% of the
catalog priced at zero**, because the price field is required and defaults to `0`, so "genuinely free" and
"never found" are indistinguishable. The fix is not a better default; it is `{amount?, currency, unit,
evidence: stated | stated_free | from | unknown, sourceText, sourceUrl, observedAt}` with **`amount` omitted
when unknown**. Note the unit rule too: "$625 for the 8-week term" is `{625, "term"}`, never $78/class.

**b) `sessions[]` with registration windows.** A listing can say "Tuesdays at 4pm" but cannot say what is
bookable, when it runs, what it costs, or whether a parent can still get in. `registrationOpensAt` /
`registrationClosesAt` are called out in the spec as the most useful thing a reviewer can find that has
nowhere to be stored — and "summer camp registration opens next month" is the strongest reason a family
returns to the product.

**c) `venueModel`: `own_premises | host_sites | in_home | online | outdoors | unknown`.** **This one the
bridge repo can corroborate hardest.** "Does this operator have a venue, and whose is it?" has been the
single most common judgement call across every review pass, and it has five different right answers that
the model cannot currently express: Physique Swimming teaches in seven host pools year-round (kept); The
Art Farm rents a school hall for an eight-week camp while owning its own venue (camp cards retired); Steve
& Kate's rents five school campuses and owns nothing anywhere (kept — renting IS the business); Brooklyn
Robot Foundry has a Gowanus studio *and* a mobile arm (kept, mobile framing stripped); Super Duper Tennis
has no courts at all and says so in its own page title (retired). Every one of those took independent
research to reach a conclusion the provider states plainly on its own site.

**d) `ageMinMonths` / `ageMaxMonths`.** The `0-2 / 3-5 / 6-8 / 9-12 / Teens` buckets cannot express "18
months to 4 years", so it rounds into two buckets and a parent with a 20-month-old is shown a class for
four-year-olds.

**e) `outOfMarketLocation`.** See item 9 — now confirmed **five times**, and the field is already being
violated in production data: cards exist carrying `boroughGuess: "Long Island"` and `"NYC / Long Island"`.
A real business outside the five boroughs currently has no honest representation, so it gets coerced into
the nearest borough.

**f) `fieldVerifications[]`** — per-field `{field, verifiedAt, sourceUrl, method, verifiedBy}`. Today one
freshly-checked phone number updates a whole-record `lastVerifiedAt` and makes an entirely stale listing
look current.

**Concrete schema for (a), (b) and (d), plus opening hours: `docs/structured-schedule-recommendation.md`**
(owner-requested 2026-08-08). It specifies the field shapes against what the live data actually holds,
anchored to schema.org's `OpeningHoursSpecification`/`Schedule` and OpenActive's SessionSeries →
ScheduledSession split. Headline measurement: **only 226 of 830 live programs (27%) carry day + start +
end**, so "what's on Friday at 5pm" is unanswerable for three quarters of the catalogue — not because the
facts are missing but because `timeText` is prose. It also notes that `recurringPrograms` is a **writable
bare passthrough**, so the program-level half can be adopted through the bridge with no core change.

**g) `inclusion{}` and `trialPolicy{}`.** Usually stated on the provider's own page and currently discarded.
Parents of disabled children cannot filter at all. `supportsAdditionalNeeds` should record **the provider's
claim** with its `sourceText`, not an assessment.

---

## 0c. An LLM prompt is published as the description of 35 live businesses  [NEW, CRITICAL]

**Severity: critical — internal machinery published verbatim to families, on live records.**

Thirty-five live `providers` records have this as their entire public `shortDescription`:

> `Extract age or grade evidence from the official program page..`

That is an instruction to the enrichment pipeline. It was written into the field instead of the result of
following it. Affected records include Brooklyn Force Soccer, Doc's NYC Lacrosse and Music Together NYC UWS.
The trailing `..` suggests a template that was never substituted.

**Recommendation.** Two changes. First, whatever writes descriptions must never persist its own instruction
text — a guard rejecting any description matching the instruction corpus would catch this class, not just
this string. Second, and more general: **a description write should fail closed.** If extraction produced
nothing, the correct outcome is an empty field, not the prompt. This is the same "absence is a value, a
placeholder is not" principle already established for `"no category"`.

**Also found in the same scan, on the same collection:** 18 live records give **`311`** — New York City's
government services line — as the provider's phone number. All 18 are NYC Parks "Kids in Motion" sites,
where 311 is presumably what the source page lists for the Parks Department. A city switchboard is not a
provider's contact number.

---

## 1. `"no category"` reaches families as a literal `NO CATEGORY` chip

**Severity: highest — this is visible on real public cards.**

`extractionEngine.ts` seeds the literal string `"no category"` (`NO_CATEGORY_PLACEHOLDER`) into
`activityTypes` when discovery has no category hint. It is meant to be stripped before display. It is not:
the string was found **stored in 89 live `providers.activityTypes` records**, and rendered on real cards.

A 2026-08-01 fix added stripping to the read paths, which made this look handled. It wasn't, for two
reasons:

1. **The stored data was already polluted** — stripping on read does nothing about 89 records that carry
   the value.
2. **Three components bypass the `topActivityTypes()` normalization seam entirely** and render
   `provider.activityTypes` raw:
   - `ProviderProfile.tsx` (~line 511)
   - `ProviderDetailRouteView.tsx` (~line 260)
   - `MyAccountView.tsx` — `SavedProviderCard` reads `activityTypes[0]` directly, which also bypasses the
     classifier's own `primaryActivityType` verdict that every other consumer respects

**Recommendation.** Stop seeding the placeholder at all — when there is no category, the correct
representation is the field being **absent**. A magic string means every consumer must remember to strip
it, and the day one forgets, a family sees `NO CATEGORY` on a card about their child's activity. Then
route the three components above through `topActivityTypes()`.

**Already done from the bridge side:** all 89 polluted records cleaned; the bridge now rejects the
placeholder in `category`, `categoryHint`, `primaryActivityType` and `activityTypes` on every collection.

**A second-order lesson worth carrying:** removing the placeholder from slot 0 promoted whatever sat
second — usually `"Art"` — so a jiu jitsu academy and a swim school both became Art cards. After deleting
a bad value, check what took its place.

---

## 2. Discovery creates many cards per business, with no dedupe

**Severity: high — this is the single largest source of bad data by volume.**

Confirmed repeatedly: **8 cards for SwimJim's 5 pools, 9 for Take Me To The Water, 7 for Brooklyn
Brazilian Jiu Jitsu's 4 schools, 6 for FasTracKids, 5 for Riverside Park Conservancy, 16 for the YMCA.**
Frequently several share a *byte-identical* `sourceUrl`.

There appears to be no dedupe on `sourceUrl` or `normalizedTitle` at card creation.

**The backlog has now been measured rather than sampled.** A full-pool scan grouping every live content
card by `sourceHost` (556 hosts, no failures) found **199 hosts carrying more than one live card, covering
684 live cards, and 87 of those hosts have two or more cards live at `PUBLISHED` simultaneously.** So
roughly one live card in five is part of a duplicate cluster, and the duplicates are not confined to
unpublished records — they are on the public site. Seven of the largest clusters have since been reconciled
by hand against each operator's own location list, which collapsed 27 live cards to 7 correct ones; at that
ratio the remaining 192 clusters represent several hundred cards a family could currently encounter twice.

**Recommendation.** Dedupe at creation on `(sourceUrl)` first — exact-URL collisions are unambiguous and
were the largest single group. `normalizedTitle` within a `sourceHost` is a good second key.

**Why this can't be fixed downstream:** nothing on a card reveals that a sibling exists. A reviewer
working a queue one card at a time cannot see the cluster; only a per-domain sweep can. That makes this a
creation-time problem by construction.

---

## 3. A bare root domain as `sourceUrl` reliably produces a fabricated or duplicated location

**Severity: high — this fabricates locations that do not exist.**

In one batch, **all five** cards whose `sourceUrl` was a multi-location franchise's bare homepage were
defective (`sylvanlearning.com`, `codeninjas.com`, `c2educate.com`, `camp.com`, `completebody.com`), each
in one of exactly two ways:

- a **borough-level duplicate** of one real centre already covered by a correctly-sourced sibling, or
- a **fabricated location** — a borough where the franchise has no branch at all (C2 Manhattan, Code
  Ninjas Manhattan, CAMP Brooklyn, FasTracKids Brooklyn ×2, Color Me Mine Bay Ridge and Park Slope).

This is structural, not bad luck: **a root domain carries no location evidence**, so whatever borough
landed on the card was inferred rather than read. Cards on per-location paths from the same hosts
(`codeninjas.com/ny-gowanus`, `camp.com/locations/fifth-ave-nyc`) were correct.

**Recommendation.** Treat a bare root domain on a multi-location brand as insufficient evidence for a
location claim. Either follow the brand's own location directory to a per-branch page before creating a
card, or create the card with no borough/neighborhood rather than an inferred one. Fetching each brand's
location list resolved five cards in five requests.

---

## 3b. An entire directory site was ingested as 795 cards — directories need to be sources, not card hosts  [NEW, HIGHEST BY VOLUME]

**Severity: highest by volume — one run created 795 bad cards.**

`letsgobaby.co` is Let's Go Baby, a curated directory of **family-friendly restaurants in NYC**. The run
`content-card-backfill-2026-06-13-prod-001` turned its entire listing into content cards: **795 of them**,
one per restaurant, bar, brewery, beer garden, steakhouse, oyster bar or cinema — Gjelina, Benihana, talea
beer co, Queue Beer Bar, Bohemian Hall Beer Garden, Pig Beach BBQ, Nitehawk Cinema.

The clearest evidence is `categoryHint`: across the cluster it holds **53 distinct values and 51 of them are
cuisines** — American, Bakery, **Bar**, **Brewery**, Chinese, Coffee Shop, Diner, Ethiopian, Georgian, Halal,
Ice Cream, Nepalese, Persian, Soul Food, **Steakhouse**, Sushi, Vegan. A family filtering by category would
have been offered a brewery. None reached `PUBLISHED`, but 684 sat in `DISCOVERED` with the pipeline working
toward publishing them.

**Recommendation.** This is a source-classification gap, not a per-card one. Discovery needs a notion of a
host that is a **candidate source** rather than a **card source**: somewhere to find real businesses worth
investigating, whose own pages never become cards directly. Let's Go Baby is genuinely useful in that role —
it is a curated list of NYC venues that welcome children. It is simply not a list of children's activities.
A first cut could be as simple as a host allow/deny list feeding card creation, plus a guard that refuses to
create a card whose `categoryHint` is outside the platform's own activity vocabulary — "Brewery" and
"Steakhouse" are not values this product should ever store.

**Related:** 11 cards in this cluster have the literal token `: family_service_review_required` appended to
their public `title` (the `kind: "repair"` cards), and several are titled just "Brooklyn" or "Manhattan".
See items 5 and 6.

---

## 4. Aggregator and directory index pages are scraped as if they were single businesses

**Severity: high — the resulting card describes no real entity.**

Three distinct shapes, all confirmed:

- **A multi-provider aggregator page.** `funclubs.com/camps` produced three cards with three *different*
  business names ("Fun Clubs Brooklyn Camps", "Kids N Motion Dance & Gymnastics", "Happy Kidz Yoga") on
  one identical URL. The operator is also in Marietta, **Georgia** — not NYC.
- **A directory's own category/search page.** A card titled literally "Psychology Today" sourced to
  `psychologytoday.com/us/groups/ny/brooklyn?category=...` — a search-results page listing many unrelated
  therapists. The card's title being the directory's own brand name is the tell that no entity was ever
  identified.
- **A directory's city index.** Five cards on `activityhero.com/in/new-york-ny` and `/in/brooklyn-ny`.

**A cheap detection heuristic that needs no fetching:** *several cards with different business names
sharing one identical `sourceUrl`* is an aggregator. In a genuine duplicate cluster the names match too;
when the names differ, the shared URL means the page describes no single entity.

**Recommendation.** Reject a source page that yields multiple distinct business names, and maintain a
denylist of known directory hosts for the *index/search* path shapes specifically — note that a directory
page for **one** business (e.g. a single therapist's Psychology Today listing) is a different, repairable
case and should not be denylisted wholesale.

---

## 5. Garbage single-word titles reach `PUBLISHED`

**Severity: high — a family sees a card titled "And".**

Confirmed live, published, zero blockers: cards titled **"New"**, **"And"**, **"Kate"**, **"Camp"**,
**"West"**, **"Camps"**. These are fragments truncated from real source page titles — "Kate" from
"Steve & Kate's Camp Manhattan"; "New" and "And" from "New Parent Workshops Williamsburg…" and "Baby and
Mom Meetups Williamsburg…".

**Recommendation.** A title that is a single word, or a stopword/conjunction, should block publication
outright. This is a cheap, high-confidence gate and it is currently absent — all of the above were
`PUBLISHED` with no blocker at all.

---

## 6. Internal pipeline vocabulary leaks into family-facing location fields

**Severity: medium-high — internal machinery shown to families as if it were a place.**

Three separate kinds observed:

- `neighborhoodGuess: "Near Manhattan priority zones"` — the pipeline's own targeting vocabulary,
  **3 confirmed instances** (City Treehouse, apple seeds, and a third).
- Scraper/pipeline metadata inside schedule fields.
- The `"no category"` placeholder (item 1).
- **The literal token `prospect` appended to the `title`** — **5 confirmed instances**, and this one is in
  the field a family reads first: `"Ninja Parc Brooklyn prospect"`, `"Coney Island Gymnastics prospect"`,
  `"Movement LIC/Brooklyn climbing prospect"`, `"Gotham Girls FC youth clinics prospect"`, `"Liberated
  Movement Kids prospect"`. Two were `PUBLISHED` with zero blockers. This looks like "prospect" in the
  sales/lead sense being concatenated onto the title somewhere in card assembly. A grep for titles ending
  in ` prospect` should find the full set quickly; the fix is presumably one line at the concatenation
  site. (Note the first of those is also misspelled — "Parc" for "Park" — which is a separate extraction
  problem, not part of this one.)

**Recommendation.** Whatever produces `"Near Manhattan priority zones"` should never write to a displayed
field; a targeted grep for that literal string is the fastest way in. As with `"no category"`, absence
beats a placeholder.

**Related, and probably a bigger fish: `neighborhoodGuess` does not appear to be derived from the source
page at all.** Three PlayGroup NYC cards share a byte-identical `title` AND a byte-identical `sourceUrl`
(`/social-skills-groups`) and differ in exactly one field — they claim **Allerton**, **Bedford Park** and
**Baychester**, three unrelated Bronx neighbourhoods, for an operator whose only two locations are 540
President St in Brooklyn and 412 6th Ave in Manhattan. Identical input cannot yield three different correct
answers. This is a sharper signal than the "East New York" repetition in item 7: that showed unrelated cards
*sharing* a wrong default; this shows identical cards *diverging*. Whatever assigns the neighbourhood is
worth tracing on its own.

---

## 7. Byte-identical wrong default values across unrelated records suggest a run-level bug

**Severity: medium — worth a look because the signature is unusual.**

Three unrelated cards carry the *identical* wrong `neighborhoodGuess` value **"East New York"** — two of
them also sharing an identical `latestRunId` and identical `createdAt`/`updatedAt`, despite describing
completely unrelated organisations (a Williamsburg baby play studio, a Long Island nonprofit, a directory
search page).

Three unrelated records landing on the *same specific* wrong value is a different failure signature from
three records independently guessing wrong in three different ways. It suggests a shared fallback/default
path in a specific discovery run.

**Contrast, because the two look similar and mean different things:** *divergent* wrong values on one
venue (Cynthia King Dance Studio had three cards guessing Park Slope, Flatbush and Windsor Terrace)
indicate a genuinely ambiguous real address — its one studio at 327 East 5th Street sits on both borders.
*Identical* wrong values across unrelated records indicate a shared code path.

**Recommendation.** Grep for cards carrying exactly `"East New York"` and check whether they share a
`latestRunId`.

---

## 8. No concept of "does this business have its own venue"

**Severity: medium — admits providers a family cannot actually visit.**

The platform assigns every provider a borough and neighborhood, which implicitly assumes it *has* a
location. Many do not. Confirmed clusters, all quarantined from the bridge side:

- **In-home / mobile / online:** Prep Academy Tutors (tutors travel or teach online).
- **School-based:** Brains & Motion, Bricks 4 Kidz, Kids in the Game, CodeAdvantage — delivery happens
  inside partner schools. One card was literally titled **"Kids in the Game PS 29 Brooklyn"** — named
  after a New York City public school, i.e. after someone else's building.
- **Marketplaces / intermediaries:** Yombu, Togetherhood ("connects schools with vetted independent
  instructors").
- **B2B training organisations that never serve children at all:** Little Flower Yoga, Bent on Learning —
  both certify *educators* to bring yoga into schools.

For all of these, the stored borough is a **catchment or service area, not an address**. The same tell
appears in card titles as "outreach", "serving X", "NYC-wide".

**Recommendation.** Add an explicit venue model — at minimum a flag distinguishing "has its own premises"
from "delivered at host sites / in-home / online" — and either exclude the latter from
location-filtered browse or label them honestly. Today they are indistinguishable from a real venue in
the data.

---

## 9. `Borough` cannot represent a real place outside the five boroughs

**Severity: medium — forces a fabricated borough onto a real business.**

The `Borough` type covers only the five NYC boroughs. Confirmed **5+ times** that a real business
genuinely serving NYC families sits outside it: Fort Lee NJ and Water Mill NY (Tennis Innovators),
Huntington Long Island (School of Rock), Westchester NY and New Canaan CT (Tim Morehouse Fencing),
Greenvale/Jericho/Little Neck (C2 Education), Marietta GA (out of market entirely).

With no valid value available, the pipeline picks a wrong NYC borough — which is indistinguishable from
fabrication downstream.

**Recommendation.** This is a product decision, not a bug fix. Options: a new city-tenant value; an
explicit "greater metro" category; or an out-of-market exclusion that is *recorded* rather than coerced.
Any of the three is better than the current silent coercion. Note the platform already supports non-NYC
tenants (`city: "la"` with its own region vocabulary), so the mechanism partly exists.

---

## 10. Program pages become location cards

**Severity: medium — inflates the pool and splits one venue across many cards.**

A venue's *program menu* becomes additional cards: "JCC Manhattan children's birthday parties", "Textile
Arts Center **Kids**", "Brooklyn Brazilian Jiu Jitsu **Kids**", "Private Picassos **Birthday Parties**",
"Asphalt Green **Basketball Foundations**", "Riverside Park Conservancy **Youth Soccer**". This was **7
of 12 terminations** in one batch and the most common cluster member overall.

**The tell:** the token distinguishing the card from its sibling names an *activity or audience*, not a
*place*.

**Recommendation.** One card per real physical location; a venue's programs are card *content*, not more
cards. Note that path depth alone does not identify the program card — Riverside Park Conservancy's
program page had a *deeper* URL than the location page, so a "prefer the deeper path" rule would pick
exactly the wrong one.

---

## Two negative controls — please don't "fix" these

Both look like defects and are not. They cost real investigation time each.

- **A foreign TLD that is the entity's own domain.** `goethe.de` for the Goethe-Institut New York is
  correct; country of registration is not evidence of off-topic contamination.
- **A sport/subject mismatch between title and domain, within one organisation.** "NYC Skyline Flag
  Football" on `nycskylinebasketball.com` is one real org running several sports. A mismatch only matters
  when the **entities** differ — as in `camp.com` (the retailer CAMP) attached to a card about Camp
  Kidville, which is a genuine defect.

---

## The one rule that prevented the worst error

Several defect shapes are indistinguishable until you check the entity rather than the domain:

| Shape | Is the entity real? | Did the domain ever belong to it? |
| --- | --- | --- |
| Off-topic contamination | No | — |
| Pipeline guessed wrong domain | Yes | Never |
| Hijacked / squatted domain | Yes | Yes, then expired |
| **Token collision** | Yes | No — it's a *different real company* |

**Always search for the card's named ENTITY before ruling on what its domain currently serves.** A card
titled "Camp Kidville UWS" was sourced to `camp.com`, which serves the real, glossy CAMP retailer whose
only NYC store is in Flatiron — so it reads as a textbook fabricated location. It isn't: Camp Kidville is
the real summer camp at Kidville Upper West Side, 205 West 88th Street, 212-362-7792. Judging by the
domain would have deleted a real operating business.

## 0d. `policy_or_safety_review` is being applied to ordinary businesses — 428 cards (2026-08-08)

**This is the most serious blocker code the pipeline has, and it appears to be firing on cards with nothing
safety-related about them.** It is the label most likely to bury a legitimate children's business
permanently, because no reviewer wants to be the one who cleared a safety flag.

**Scale (census, not a sample):** 428 content cards carry it — **175 maintainable + 253 quarantined**.

**Four checked individually, none with any safety dimension:**
- **TLB Music** — a real Upper East Side music school. Its site returns HTTP 403 to automated requests. The
  page could not be READ, and that became a safety concern.
- **Bach to Rock Syosset** — a Long Island music school. Out of market, nothing else.
- **Manhattan Plaza Health Club Swim School** — a swim school at its own Hell's Kitchen facility, sourced to
  its own domain.
- A representative sample of the remaining 175 is likewise ordinary: Amerikick Park Slope, Bubbles Academy,
  Clayhouse Brooklyn, Pier 2 Roller Rink, Fastbreak Sports, Elite Skills Basketball.

**What this bridge did NOT do, deliberately:** it did not bulk-clear the code. The asymmetry is the whole
point — wrongly clearing one real safety flag is far worse than leaving several false ones in place. It has
been removed only on cards verified individually (three so far), each with the reason recorded.

**Correlation evidence added 2026-08-08, across all 3,857 cards.** The code co-occurs with COMPLETENESS
blockers and with nothing content-related:
- **73%** of cards carrying `weak_location_evidence` also carry `policy_or_safety_review`.
- Of the 267 safety-flagged cards WITHOUT weak location evidence, **160 are missing an official image** and
  **116 a schedule**.
- One oldest-first batch of ten NYC youth leagues had the pair on **nine of ten** cards.

A code meaning "this content raises a child-safety concern" should not track whether an image was found. On
this evidence it is measuring record completeness, and inheriting the vocabulary of safety.

**What is needed from the core app:** the rule that sets this code. The strong hypothesis from the TLB Music
case is that an unreadable or non-200 source is being treated as a safety signal, which would explain why
bot-blocked sites and out-of-market pages both attract it. If that is the rule, the fix is to distinguish
"could not fetch" from "fetched, and the content raises a concern" — they are not the same finding and only
one of them is about children's safety.

**Correction to an earlier note in this file's sibling doc:** a 25-card sample once found zero cards carrying
this code and it was written up as "does not generalise". The census shows 21% of quarantined cards carry it.
The sample was unrepresentative; the conclusion was wrong.
