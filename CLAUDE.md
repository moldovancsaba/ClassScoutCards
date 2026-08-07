# Working rules — ClassScout Cards (card-bridge)

These instructions OVERRIDE any default behavior. Read this file before touching anything in this
repo — most of what looks like a design choice here was a hard-won lesson from a real debugging
session, not a preference, and re-deriving it costs real time.

## Children's safety comes first — always verify the card's reality before deciding (owner directive, 2026-08-07)

Every decision this bridge or its review loop makes — enrich, fix, leave, block, or quarantine — is
ultimately a decision about what a real family sees when looking for a real activity for their child.
**Before judging whether a card's fields are internally correct, first establish whether the card
describes a real entity that actually operates a children's activity/class/camp/program serving NYC
families at all.** A record can be internally tidy — a plausible-looking name, a category, a borough, a
schedule — and still fail this first, more fundamental test: the `cc-854c0e40e153afb2891ec461` /
`prov-replacement-parts-step2` case (a toy manufacturer's e-commerce checkout page) and the
`cc-77deeeb03a1ad8b054aba8dd` / `prov-youtube-app-app-store` case (a video app's own App Store listing)
were BOTH internally plausible-looking and both were not children's activity providers of any kind —
the reality check, not a field-by-field audit, is what caught them.

**When that reality check is negative or genuinely can't be confirmed, the safe default is to protect
families, not to give the record the benefit of the doubt.** Don't leave an off-topic, fabricated, or
unverifiable record live just because no single field is individually wrong enough to justify the
call alone — the four target properties (category, age/schedule/location, image, copy) are checks for
an already-established real entity, not a substitute for confirming the entity is real in the first
place. This is the reasoning behind every quarantine decision documented in
`docs/card-improvement-process.md`, and it should be treated as the first question asked on every card,
not an occasional targeted sweep.

**Quarantine is not a decision to hold for confirmation (owner directive, 2026-08-07): "shoot first,
then ask."** Once the reality check comes back negative — the record does not describe a real entity
operating a children's activity for NYC families — quarantine it immediately (dry-run then apply, per
the bridge's own always-dry-run-first convention; that is the safety check, not a request for
sign-off) and report what was done afterward. Do not pause mid-loop to ask whether an off-topic or
fabricated record should be quarantined; that question has already been answered by this principle.
Reserve actually asking for genuinely ambiguous cases only — e.g. a real, legitimate entity where the
correct field-level fix is unclear, not "is this off-topic thing allowed to stay live."

## Physical-only providers; one card per physical location (owner directive, 2026-08-07)

Two hard rules, additive to "Children's safety comes first" above — part of the same reality check, not
a separate review pass:

1. **Only physical, brick-and-mortar activities are in scope.** A card must represent a real place
   children physically attend for an activity. Categorically prohibited — same tier as off-topic
   contamination, quarantine on sight, no field-level fix exists — are e-commerce/shopping platforms
   (Amazon, eBay, and equivalents), social media platforms (YouTube, Instagram, Facebook, TikTok, and
   equivalents), and pure online-only services with no physical location a child ever attends.
   - **Prohibition is about what the ENTITY is, not which domain hosted the source page describing it.**
     A real physical business whose only findable source happens to be a social-media-hosted page (a
     Facebook event listing for a real library story-time, a `psychologytoday.com` directory entry for
     a real physical therapist's office) is a "real entity, bad source pick" case — handle it the same
     way as any other real-entity-behind-a-bad-source finding already in this doc (find a better source,
     or leave sourced-as-is with the gap noted), not an automatic prohibition. Investigate first: does a
     real physical location actually exist behind this listing?
   - **A real brick-and-mortar business that also offers an online/virtual option stays in scope.** Keep
     the card — a real physical location exists — but strip online-class language from the description/
     `activityTypes` so the record doesn't read as an online offering; the physical program is what's
     being listed, not the virtual add-on.
   - **A "no fixed venue" business fails the test, even though it's real (found 2026-08-07, distinct from
     the hybrid case above)**: a business whose entire delivery model is in-home/mobile/virtual — e.g. a
     network of independent teachers who travel to a family's own home, with no studio address of the
     business's own at all — is prohibited, not because the activity isn't physically real (a family's
     home is a real place), but because there is no location belonging to the business itself to assign a
     borough/neighborhood to. The hybrid rule above assumes a REAL FIXED LOCATION plus an online option;
     this is the opposite case (no fixed location, period) and doesn't qualify.
2. **One card per real physical location, not one card vaguely covering "multiple" locations.** When
   research finds an organization operates more than one distinct physical location (real case: Tennis
   Innovators' several separate NYC courts, under one generic card with `neighborhoodGuess: "Multiple"`),
   each location should become its own separate card via `POST /api/card-bridge/split` (see its own
   section in `README.md`/`docs/card-improvement-process.md`) — one location per card is itself a
   distinct choice a family is making, not an implementation detail to compress away. This is now a
   PROACTIVE part of the review, not something to wait for a review to accidentally stumble into:
   whenever research surfaces more than one confirmed physical location for the same org, that is itself
   a split candidate, evaluated the same review pass that found it.

## Content-quality and data enrichment is a canonical, rigid, strict requirement — not just catching bad cards (owner directive, 2026-08-07)

Everything above (children's safety, physical-only, one-card-per-location) is about keeping bad or
non-qualifying records out. **This rule is the other half of the same standing mandate: for every card
that passes the reality check and IS a real, in-scope entity, actively improving its content quality and
data — descriptions, addresses, phone/contact details, schedules — is mandatory, not optional, on every
review pass.** Confirming a card is real is not the finish line; a real business with a generic,
identical-in-both-fields placeholder description, a borough-level-only address, or a schedule field that
actually contains leaked scraper/pipeline metadata is still a card that failed the family it's for, even
though it passed the reality check. Treat "does this card's copy read as specific and warm, not generic"
(already a checklist item) and "does this card carry the best real contact/address/schedule detail
findable" as required checks on every card, the same tier as the prohibition checks — not something to
reach for only when there happens to be time left over. The concrete precedent: `prov-the-art-studio-ny`'s
generic 47-character placeholder description, borough-level address, and metadata-polluted schedule field
were all rewritten from independently-verified real facts (see
`docs/card-improvement-process.md`'s "First real description/copy enrichment..." section) — that standard
applies to every real card going forward, not just the one it happened to be demonstrated on first.
**Where this bridge structurally cannot do this** (pre-publish `contentCards`, which carry no description/
phone/address fields at all in this bridge's schema — see `cardBridgeRegistry.ts`), the requirement still
applies to whatever fields DO exist (`title`, `categoryHint`, `boroughGuess`/`neighborhoodGuess`,
`terminalReason`) and to recording every real fact found in `terminalReason`/`reason` text so a future
enrichment pass on the live `providers` record doesn't have to re-research from scratch.

## The main `classscout` repo is READ-ONLY (owner directive, 2026-08-07)

**Every commit and push you make belongs in THIS repo (`classscoutcards`), never in the main
`classscout` repo.** You may read `classscout`'s source to understand the real schema/business logic
you're porting or to research a bug's root cause (exactly what the "ported, not imported" table below
is for) — but never edit, commit, or push there, no matter how small or well-tested the fix, no matter
how directly a real bug traces to a specific line in that repo. Real incident: a same-day agent found
and fixed two genuine bugs directly in `classscout` (a discovery-pipeline aggregator-detection gap, a
meetup-group quarantine capability) — both correct, both tested, both committed and pushed to
`classscout`'s own `main`, and both should never have happened that way. When you find something wrong
in the core app, the deliverable is a **written recommendation** in
`docs/card-improvement-process.md` (see "Aggregator/directory sources" for the pattern this convention
followed) — specific enough that whoever owns that repo could implement it directly from your writeup,
but implemented by them, not by you. Add a git remote, clone, `git log`, `grep` — anything read-only —
freely. Never `git commit` or `git push` in a `classscout` checkout.

## What this repo actually is (as of 2026-08-07)

Three things live in this one repo:

1. **The card-bridge** (`src/lib/delivery/`, `src/lib/auth/`, `src/lib/familyServices/`,
   `src/lib/validation/`, `src/pages/api/card-bridge/*`) — the current, active reason this repo
   exists. A thin, read/write HTTPS API in front of the **main `classscout` app's own MongoDB
   database**, deployed to its **own, separate Vercel project** specifically so an environment whose
   network policy allows outbound HTTPS but not a native MongoDB (TCP 27017) connection can still work
   with real card data, and so this experimentation can never put the main app's Vercel project at
   risk. **`docs/card-improvement-process.md` is the canonical, binding operating procedure for this
   part of the repo — read it before running any loop iteration or write.**
2. **The card generator** (`src/pages/api/generate.ts`, `src/pages/api/status.ts`,
   `src/pages/api/history.ts`, `src/pages/api/cards/[id].ts`, `src/lib/generator/`,
   `src/lib/delivery/{ingestApi,mongoDirect}.ts`) — an older, separate feature: generates new activity
   cards and delivers them to the main app either via its ingest API or by writing directly into the
   main app's `providers` collection. Not part of the card-bridge; don't conflate the two.
3. **The stats page** (`src/pages/stats.tsx`, `src/lib/delivery/cardBridgeStats.ts`,
   `src/pages/api/card-bridge/stats.ts`) — a read-only reporting view: total counts for `contentCards`
   and `providers`, with a published/not-published split on every number, grouped by borough/area and
   neighborhood using the **same canonical location logic the main app itself uses**
   (`src/lib/delivery/locations.ts` — see its own header comment for exactly what's ported vs. added),
   plus an activity breakdown and a card-level "Sport Cards" summary. Deliberately public (no bridge-key
   auth) since it only ever returns aggregate counts, never individual record content — the page queries
   MongoDB directly server-side in `getServerSideProps` rather than round-tripping through its own API.
   Live at `https://compare.messmass.com/stats`.
4. **The split capability** (`src/lib/delivery/cardBridgeSplit.ts`, `src/pages/api/card-bridge/split.ts`)
   — for a card that actually represents more than one real thing (several real locations, an aggregator
   page listing several real businesses, or two orgs mashed into one record once each has been
   independently re-sourced), creates N new documents and blocks/quarantines the parent. The only
   capability in this repo that INSERTS new documents rather than updating existing ones — read its own
   header comment in full before touching it; the safety rails there (forced `visibility: "hidden"` on
   every split-off provider, a required distinct source per child, real ID-generation schemes ported
   from the main app) are load-bearing, not decoration.

## Current status (2026-08-07)

A 100-card mass-enrichment pass (`docs/card-improvement-process.md`, now at v33+) has been completed —
a new agent picking this up is not starting from zero. Read that doc's Changelog before assuming a
pattern is undiscovered; it very likely already has a name, a fix pattern, and a confirmed-instance
count. One open item handed off from that pass, not yet resolved:
- **Live off-topic contamination with zero blockers**: at least five cards were found `PUBLISHED`/
  `active` (or having already produced a live `providers` record) with completely off-topic
  sourceHosts (a foreign university LMS, a general-audience reference article, a toy manufacturer's
  own e-commerce checkout page, a media app's own App Store listing, a tech-news how-to article) and no
  blocker at all on the live record — never caught by quarantine (see
  `docs/card-improvement-process.md` v35/v36/v37). All five were found by chance while working an
  oldest-first queue, not a targeted sweep, which is itself evidence there are very likely more —
  notably, instances 3/4/5 were the #1, #2, and #3 oldest-updated records in the ENTIRE pool (three in a
  row), all untouched since June, confirming the oldest end of the queue is disproportionately where
  this contamination lives. A **distinct but related pattern** also confirmed a second instance the same
  session: a real out-of-market business (a Georgia camp company) given a fabricated NYC borough,
  compounded with an aggregator-style mashup of unrelated programs under one identity — see
  `docs/card-improvement-process.md`'s out-of-market section. **Operating stance**: once the reality
  check fails, quarantine immediately, don't hold it for confirmation (see "Children's safety comes
  first" above) — but the very next record checked after the fifth instance (a real, legitimate
  multi-location NYC tennis program with genuine data gaps) was correctly left alone, confirming this is
  "quarantine when the check fails," not "quarantine anything old." Worth a targeted sweep of the oldest
  records specifically, not just reactive fixes as they're stumbled on.

Card-splitting (the other open item as of the last update to this file) is now designed, built, AND used
in production for the first time (2026-08-07, `cc-9bbab6a42d8cfc4c2741ba77` "Tennis Innovators NYC" split
into 3 real Manhattan location cards) — see item 4 above and `docs/card-improvement-process.md`'s
splitting section (esp. "First real-world use...") for both when to use it and a real open scope
question it surfaced: this platform's `Borough` type only covers the 5 NYC boroughs, with no defined way
to represent a real physical location that's genuinely out of that taxonomy but still serves NYC
families (e.g. Fort Lee, NJ, a 15-minute drive from the Upper West Side). **Confirmed 3 times
independently in one session** (2026-08-07): Fort Lee NJ/Water Mill NY (Tennis Innovators), Long Island
(School of Rock Huntington), and Westchester NY/New Canaan CT (Tim Morehouse Fencing) — see
`docs/card-improvement-process.md`'s 5-card-batch section. No longer a one-off edge case; worth an actual
product decision (a new city-tenant value? an explicit "greater metro" category?) rather than continued
individual flagging. Not decided here — flagged as a recommendation.

## The one fact that will cost you hours if you get it wrong

**`MONGODB_DB_NAME` must be `classscoutcluster`, not `classscout`.** The cluster name and the real
database name are the same string, which is exactly why the wrong guess is so tempting — and a wrong
value produces a clean `200` with an empty result set, not an error, so it silently looks like "no
data yet" instead of "wrong database." This one variable being wrong is what an entire earlier
debugging pass in this project's history was about. `.env.example` documents this inline; don't let it
drift back to the plausible-but-wrong value.

## Where the real business logic actually lives (read this before writing more of it)

Nothing in `src/lib/familyServices/`, `src/lib/validation/copyQuality.ts`, or the `ContentCardState`
enum in `src/lib/delivery/contentCardsBridge.ts` was invented here — it is **ported, not imported**,
from the main `moldovancsaba/classscout` repo (a separate deployment; there is no shared package):

| Ported here | Ported from (main `classscout` repo) |
| --- | --- |
| `src/lib/validation/copyQuality.ts` | `src/lib/publicDescriptionQuality.ts` |
| `src/lib/familyServices/types.ts`, `core.ts` | `src/lib/familyServices/types.ts`, `core.ts` |
| `contentCardsBridge.ts`'s `ALLOWED_STATES` | `src/lib/contentIntelligence/contentCards.ts`'s `ContentCardState` |
| Registry field names (`cardBridgeRegistry.ts`) | `src/types/provider.ts`, `src/types/meetup.ts`, `src/lib/contentIntelligence/contentCards.ts` |
| `src/lib/delivery/locations.ts` (boroughs/neighborhoods + canonicalization) | `src/data/locations.ts`, `src/data/laLocations.ts`, `src/data/placeLabelNormalize.ts` — its own header comment says exactly which parts (LA's `findCanonicalArea`) are this repo's own addition, not a port |
| `cardBridgeSplit.ts`'s ID-generation (`computeContentCardIdentity`, `slugifyProviderName`) | `contentCards.ts`'s `buildContentCardIdentityFromParts`, `classscoutAdapter.ts`'s `slugify` + its `id: prov-${slugify(title)}` call site |

**If you're about to write new validation/derivation logic for a field this bridge touches, check
whether the main app already has the real rule first** (its own docs — `docs/business-rules.md`,
`docs/classscout-content-card-rule-system.md` — are the SSOT for what's *correct*, not this repo). Port
it faithfully rather than inventing an approximation. These are hand-synced, not automated — if the
main app's version changes, this repo's copy goes stale silently. Note the port + its main-repo source
in a comment when you add one, the way the existing ports do.

## Deployment

- **Vercel project**: a repurposed project at `compare.messmass.com` (the domain predates this use —
  don't be thrown by the name). Deploys automatically on every push to `main`; there is no
  preview/staging gate configured, so `main` **is** production for this repo.
- **Required env vars on that Vercel project** (set already; if they're ever missing, `/api/status`
  and `/api/card-bridge/diagnose` are the fastest way to confirm): `MONGODB_URI` (same Atlas cluster as
  the main app), `MONGODB_DB_NAME=classscoutcluster`, `CARD_BRIDGE_API_KEY` (dedicated secret, separate
  from `CLASSSCOUT_INGEST_KEY`).
- See `README.md` for the full env reference and local dev setup.

## Conventions this repo follows

- **Pages Router**, not App Router (`src/pages/api/*`, `NextApiRequest`/`NextApiResponse`) — this
  predates the card-bridge work; match the existing style rather than introducing App Router routes.
- **Every write is dry-run by default** (`dryRun` defaults to `true`; a write only applies with an
  explicit `"dryRun": false`), **allow-listed per collection** (`cardBridgeRegistry.ts` — never widen a
  collection's `writableFields` without also considering whether the new field needs its own
  validation, the way `category`, `state`, `status`, `qualityStatus`/`visibility`, and the copy fields
  all do), and **audited** (`cardBridgeAuditLog`, every applied write, with the before-image). Follow
  this pattern for any new writable field or collection — don't add a bare passthrough field.
  `cardBridgeRegistry.ts` is the living source of truth for exactly which fields are writable today —
  it has grown a lot (started with the copy/category fields; a single day of real card reviews added
  `address`, `neighborhood`, `phone`, `activityTypes`, `borough`, `programType` on `providers` and
  `qualityStatus`/`visibility` on `meetupGroups`, each one driven by a real defect the bridge couldn't
  otherwise fix) — read the file itself, don't trust a field list written down anywhere else, including
  this one.
- **When you find a bug or a gap while reviewing cards, fix it at every layer it actually touches, not
  just the one in front of you** — code (this bridge's registry/write validation, or the main app's
  pipeline if the bug lives there), the SOP (`docs/card-improvement-process.md` — this is the part that
  has held up consistently), AND this file plus `README.md` if the change is the kind of thing a future
  agent would otherwise have to re-discover the hard way. That last part slipped for a real stretch this
  session — several registry widenings and a runaway-loop bug (see below) landed in the SOP and the code
  but not here, until asked directly whether that was actually happening. It wasn't, consistently. Treat
  "did I update the onboarding docs too" as a real question to ask on every fix, not an afterthought.
- **Tests**: plain Vitest (`describe`/`it`/`expect`, `@/` alias to `src`), `npm test`. Pure logic
  (validators, derivations, allow-list checks) is unit-tested directly; DB-touching code
  (`cardBridgeClient.ts`, the `db.collection(...).updateOne(...)` calls) is not mocked anywhere in this
  repo — that's an existing gap, not a new one; verify those paths live against the real deployment
  instead (dry-run first, always).
- **No ESLint config exists** in this repo (`next lint` prompts interactively to set one up) — this
  predates the card-bridge work; don't silently accept whatever the interactive prompt defaults to.
  Flag it if you're asked to fix it, don't fix it as a side effect of something else.
- **`next@14.2.3` has known critical vulnerabilities** per `npm install`'s own warning — pre-existing,
  flagged, not yet upgraded. Don't let an unrelated task quietly become a major version bump; raise it
  explicitly first.
- **Commits**: plain, descriptive, no AI-attribution footers/co-author trailers/model names — matches
  the main `classscout` repo's explicit owner directive; there's no reason for this sibling repo to
  differ.

## Hard-won lessons from actually running the review loop (2026-08-07)

- **A provider or meetup group can belong to a non-NYC city tenant** (`city: "la"`, absent = the "nyc"
  default) with its own region/neighborhood vocabulary entirely distinct from NYC boroughs (LA uses
  `"Central LA"`/`"Harbor"`, not `"Manhattan"`/`"Brooklyn"`). An unfamiliar-looking `borough` value is NOT
  automatically a bug — check `city` first, then judge the region against THAT city's own geography (in
  the main `classscout` repo, `src/data/laLocations.ts` for LA), not NYC boroughs. Real case:
  `prov-angels-gate-cultural-center-san-pedro` looked like an out-of-scope LA record on an NYC platform;
  it was actually a legitimate LA-tenant record with the wrong LA region.
- **Bulk operations need a real stopping condition, and "fetch oldest N, touch, repeat until empty" is
  NOT one.** Touching a record only refreshes its `updatedAt` — it never removes the record from
  matching the same query again, so that loop never naturally terminates on real data. A first attempt
  at bulk-deprioritizing every non-Classes/Camps record looped ~5,100 times against a 70-document
  `meetupGroups` collection before being caught and killed manually. The fix: track every ID touched
  *this run* in a Set, stop the moment a fetched batch contains nothing not already in that set, and add
  a hard numeric safety cap regardless of how correct the logic looks. Full writeup, including the
  filter-by-exact-category variant that avoids the problem more often:
  `docs/card-improvement-process.md`'s "Bulk operations" section.
- **A write payload with an apostrophe is a real hazard through an inline shell string.** `curl -d
  '{"description": "..."}'` makes it easy to silently drop an apostrophe while escaping around the outer
  shell quotes (happened live: "Prospect Parks" instead of "Prospect Park's", caught only because the
  dry-run output was actually read). Write the JSON body to a file and use `curl --data @file.json`
  instead — no shell-quoting interaction with the payload's own content.
- **`incompleteFields: []` (or an empty array like `ageRanges: []`) is not proof a record is actually
  complete.** It recurred across multiple real cards in one batch — a false "nothing missing" signal
  sitting right next to a real, findable gap. Don't skip step 2's field-by-field read just because the
  emptiness check looks clean.
- **A query parameter that's syntactically accepted is not proof it's actually wired up.** `GET
  /api/card-bridge/rows?...&id=X` was called this way dozens of times across a full review pass before
  anyone noticed the handler never read `id` at all — it silently fell back to "return the current
  oldest row," which happened to coincide with the right answer every time only because the review loop
  always asked for whatever was *already* the current oldest record. Caught only when two different
  `&id` values both returned the same row. Now fixed (`src/pages/api/card-bridge/rows.ts`) — but the
  general lesson stands: when you fetch "by id," check the id in the response actually matches the id
  you asked for at least once, don't just trust that a parameter with the right name does what its name
  suggests.
- **The worst version of an off-topic-contamination bug leaves no trace to notice.** Every other
  off-topic case found this run (an aggregator page, a totally unrelated site) was at least caught and
  `QUARANTINED` before going live. Two cards were not: fully `PUBLISHED`/`active`, zero `blockerCodes`,
  looking exactly like a correct record except that `sourceHost` was a foreign university's LMS login
  page or a general-audience reference article. There is no field to check for this — the only tell is
  that the `title`/`sourceHost` don't describe an actual local business. If you're ever short on
  specific defects to check and want to spend spare review time well, a targeted sweep for `PUBLISHED`
  cards with clearly-generic/non-local `sourceHost`s is a better bet than re-checking already-solid
  records.
- **A card's stored `sourceUrl` domain can be hijacked or squatted by entirely unrelated content after
  the real business itself moves to a different domain/TLD — this is NOT the same failure as off-topic
  contamination.** Real case (100-card test, batch 4, 2026-08-07): `urbandunes.com` (a real card's
  sourceUrl) now serves an unrelated Dubai real-estate blog with zero connection to the original
  business; independent search confirmed Urban Dunes (a real NYC indoor sandbox playground, 122 E 91st
  St) is still real and operating, just now at `urbandunes.co` — a different TLD. Off-topic contamination
  means the CARD's entity was never real; a pipeline-guessed-wrong-domain means the pipeline attached a
  domain that never belonged to the business. This is a third, distinct case: the domain genuinely WAS
  the business's real site at some point, then expired/changed hands and got repurposed. Judging by what
  the stored sourceUrl currently resolves to would wrongly quarantine a real, currently-operating
  business — always verify the entity itself via independent search before concluding "off-topic" from
  domain content alone.
- **A one-card-per-physical-location split candidate can surface even on an already-`PUBLISHED` record,
  not just a `QUARANTINED` one.** Real case (100-card test, batch 5, 2026-08-07): a live, published card
  ("NY Preschool Camp - Brooklyn Locations") mashed 4 confirmed distinct real Brooklyn locations of NY
  Preschool & Kids Club into one record — its own `neighborhoodGuess` literally listed all 4
  neighborhoods, the same tell as the earlier Tennis Innovators case. The one-card-per-location rule
  applies regardless of current pipeline state; don't reserve split candidates for cards that happen to
  already be blocked.
- **Two distinct content cards can represent the identical real physical location**, differing only by a
  title abbreviation. Real case (same session): "Tiger Schulmann's Upper East Side" and "Tiger
  Schulmann's UES" shared the same sourceUrl and the same real address (1470 1st Ave, NY 10075) — the
  same location under two separately-discovered card records. This bridge has no merge/delete capability
  for content cards, so the fix is: pick one as canonical (fix it with the real facts), and mark the
  other `BLOCKED_TERMINAL` as a duplicate rather than carrying two copies of the same facts through the
  pipeline. Distinct from the earlier card-vs-live-provider "superseded" pattern — here both records are
  pre-publish content cards, not one card versus one already-live provider.

## Before you write anything real

1. Read `docs/card-improvement-process.md` in full — it is the binding process spec (selection order,
   the verification checklist, the three decision matrices, the explicit boundaries on what this bridge
   is and isn't allowed to do).
2. Confirm `MONGODB_DB_NAME` on whatever deployment you're pointed at (see above).
3. Dry-run before every apply. No exceptions, no "this one's obviously fine."
