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

## Never write "no category" — absence is a value, a placeholder is not (owner directive, 2026-08-07)

**"Never add 'no category' even if no category."** `"no category"` is an ingestion-only placeholder from
the main app (`extractionEngine.ts`'s `NO_CATEGORY_PLACEHOLDER`), seeded when discovery has no category
hint and meant to be stripped before display. It was not: the literal string was found **stored in 89 live
`providers.activityTypes` records**, and rendered on real public cards as a `NO CATEGORY` chip (owner
screenshot). When there is genuinely no category, the correct representation is the field being **absent** —
never a magic string standing in for one, because every consumer then has to remember to strip it, and the
day one forgets, a family sees "NO CATEGORY" on a card about their child's activity.

This is enforced, not conventional:
- `validateWriteRequest` (`cardBridgeWrite.ts`) **rejects** the placeholder in `category`, `categoryHint`,
  `primaryActivityType` and `activityTypes`, on every collection, case/whitespace-insensitive.
- `alignActivityTypes` (`activityAlignment.ts`) strips it before deriving anything. This is load-bearing:
  the placeholder usually sat at index 0, so when a title matched no activity label the old code fell
  through to `candidates[0]` and **promoted `"no category"` to the primary activity**.
- All 89 polluted live records were cleaned (bounded loop, verified 0 remaining).

Two lessons generalize beyond this one string. **First: a "display-only" bug is worth checking against the
stored data before believing it.** The 2026-08-01 fix in the main app added stripping to the read paths,
which made this look handled; it wasn't, because the data itself was polluted and two components
(`ProviderProfile.tsx`, `ProviderDetailRouteView.tsx`) render `provider.activityTypes` raw, bypassing the
`topActivityTypes()` normalization seam entirely — a third confirmed instance of that bypass after
`MyAccountView.tsx`. **Second: removing a bad value can expose a worse one underneath.** Stripping the
placeholder from slot 0 promoted whatever sat second — usually "Art" — so a jiu jitsu academy and a swim
school both became Art cards. The real fix was porting the main app's own `ACTIVITY_KEYWORDS` regexes so
title matching understands how listings actually name themselves ("Jiu Jitsu" → Martial Arts, "Water" →
Swimming), matching only activities the listing already carries. **After deleting a bad value, re-check
what took its place.**

## The main `classscout` repo is READ-ONLY (owner directive, 2026-08-07)

**The accumulated recommendations for that repo now live in one place: `docs/classscout-core-recommendations.md`.**
Ten items, ordered by family impact, each with what was observed, how often, and what the bridge could and
could not do about it — plus two negative controls ("looks like a defect, isn't") that cost real
investigation time each. Add to that file rather than scattering new core-app findings through the SOP.


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

**The owner-requested 100-card sovereign autonomous test is now complete** (2026-08-07, 10 batches of
10 cards each, `docs/card-improvement-process.md`'s "100-card sovereign autonomous test" section has the
full per-batch tables plus a retrospective). Headline result: roughly 80% of the 100 were real NYC
businesses wrongly held behind stale/bot-blocked/network-layer source checks (fixed to
`BLOCKED_REPAIRABLE`), confirming the earlier off-topic-contamination finding above was NOT reproduced at
scale in this sample — it remains a real, separate risk worth its own targeted sweep, but is not what
dominates the queue. New patterns discovered during the test and already folded into the "Hard-won
lessons" section below: sourceUrl domain hijacking (Urban Dunes), splits surfacing on already-`PUBLISHED`
records, duplicate content cards for the identical location (confirmed 3x: Tiger Schulmann's, Mathnasium,
Gymstars), a named real org not guaranteeing THIS card is real (Liberated Movement, Little Notes), the
TLS-certificate-issuer-check methodology fix, and a real brand's card still failing on a
confirmed-nonexistent specific location (PLAYDAY NYC Tribeca, Tiger Schulmann's Park Slope — 2x).

**The owner-requested continuation past the first 100 (cards 101-200) is now also complete**
(2026-08-07, 10 more batches of 10, `docs/card-improvement-process.md`'s "Cards 101-200: continuation
complete" section has the full per-batch tables plus a retrospective). Aggregate: ~68 real entities
corrected, ~24 already-correct cards touched, ~8 quarantined/terminated on confirmed reality-check
failures. Four genuinely new patterns surfaced and are folded into the "Hard-won lessons" section below:
a confirmed-permanently-closed business (real once, not now — City Treehouse), a garbage single-word title
reaching an already-`PUBLISHED` live record (The Canopy NYC's "New"/"And" pair), a directory site's own
multi-result search-results page mistaken for a single entity (Psychology Today), and multiple cards
sharing a byte-identical wrong default value as a possible run-level pipeline bug signal (the recurring
"East New York" value, seen on 3 unrelated cards across 2 batches). The duplicate-content-card count grew
from 5 to 7 confirmed instances (RoboFun again, then Fastbreak Sports), and the real-brand-fake-location
count grew to 3 (Color Me Mine Bay Ridge). Also implemented the `alignActivityTypes()` top-3-selection fix
(see item 4 above) per an explicit owner directive mid-pass. One split-candidate opportunity (Little
Scholars, several confirmed Brooklyn locations) was identified but deliberately deferred to a future pass
rather than rushed.

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
- **A named real organization turning up in search is not the same as this card being confirmed real.**
  Real case (100-card test, batch 7, 2026-08-07): "Liberated Movement Kids prospect" named a genuine NYC
  nonprofit ("Liberated Movement," donation-based dance classes) — but its studio closed months earlier,
  it now operates out of rented space rather than its own venue, and nothing found connected it to "kids"
  classes or to "Prospect" (the card's own neighborhood claim). Every other "real but blocked" case this
  session (stale blocker, bot-block, network failure, wrong/hijacked domain) still had the SPECIFIC facts
  on the card confirmable once you found the real business. Here they weren't. When the entity's own
  current facts don't support the specific claims on the card, the reality check still fails — leave it
  `QUARANTINED` and document what was found, don't move it forward just because a same-named organization
  exists somewhere.
- **A curl TLS error is not automatically a genuine site-side certificate misconfiguration — check the
  certificate issuer before concluding that.** Real case (100-card test, batch 8, 2026-08-07): two sites
  (`languageworkshopforchildren.com`, `cityicepavilion.com`) failed with what looked like the same class
  of error as the earlier confirmed `CN=*.web-hosting.com` genuine-hosting-misconfiguration case — but
  running `openssl s_client` directly showed the certificate issuer was THIS research environment's own
  egress-proxy CA, not the origin site's real certificate. Both businesses were confirmed real via
  independent search regardless, but the terminalReason should say the TLS issue is environment-side, not
  claim a site defect that was never actually confirmed. Check `openssl s_client ... | openssl x509 -noout
  -issuer` before writing "genuine current TLS misconfiguration" into a card's reasoning.
- **A real, multi-location brand can have one card whose SPECIFIC claimed location is confirmed not to
  exist, even while other cards for the same brand are correctly real.** Real case (100-card test, batch
  9, 2026-08-07): "PLAYDAY NYC Tribeca" named a real children's art-studio brand (2 of its real locations
  were already split into their own cards in an earlier batch) — but independent search confirmed PLAYDAY
  never opened a Tribeca studio, or it has since closed; its actual 4 current studios are Upper West Side,
  Park Slope, Cobble Hill, and Long Island City. Being right about the brand is not the same as being
  right about the specific location a card claims — left `QUARANTINED` rather than assumed real just
  because sibling cards for the same brand had already been fixed.
- **"Cap `activityTypes` at 3" was never enough on its own — WHICH 3 matters as much as how many**
  (owner directive, 2026-08-07). The original rule ("take the source's own first 3, in source order")
  reproduces the exact bug it was meant to prevent: a real "Basketball School" card with `activityTypes`
  in discovery order `["Music", "Basketball", "Sports", "Soccer", "Handball"]` (a "Music" keyword pattern
  happened to fire first) kept Music in its top 3 while cutting a genuinely-related activity. Fixed with
  real selection logic, not a positional trim: `src/lib/delivery/activityAlignment.ts`'s
  `alignActivityTypes()`, wired into `applyCardBridgeWrite` for every `providers` write touching
  `activityTypes`/`primaryActivityType` — determines the primary activity (from `primaryActivityType` or
  the provider's own name/title), keeps only OTHER activities from the SAME topical cluster (4 clusters
  mirroring the main app's own `extractionEngine.ACTIVITY_KEYWORDS` vocabulary: Sports & Fitness, Arts &
  Performance, Academic & STEM, Play & Recreation), caps at 3, primary always first. A separate, related
  defect this does NOT fix lives in the main `classscout` repo (read-only from here) —
  `MyAccountView.tsx`'s `SavedProviderCard` reads `activityTypes[0]` directly, bypassing even the
  classifier's own `primaryActivityType` verdict that every other consumer already respects; documented
  as a one-line recommendation in `docs/card-improvement-process.md` for whoever owns that repo.
- **A business that was genuinely real can still fail the reality check today if it has since permanently
  closed — this is a distinct case from every other "real but blocked" pattern above.** Real case (cards
  101-200 continuation, batch 14, 2026-08-07): City Treehouse (129A W 20th St, Chelsea) is reachable at
  its own domain and looks exactly like an ordinary stale-blocker case — but independent search (Yelp,
  explicitly marked "CLOSED" as of July 2026) confirms the business has permanently closed. Every prior
  "real but blocked" pattern (stale blocker, bot-block, network failure, hijacked/rebranded domain,
  research-environment TLS false positive) describes a business that is still operating today; this one no
  longer exists at all. A confirmed-closed business fails the children's-safety-first reality check the
  same way a never-real one does — presenting it as a live option misleads a family exactly as badly as
  fabrication would, regardless of whether the business was once genuinely real. Left `QUARANTINED`, not
  moved to `BLOCKED_REPAIRABLE` (there is nothing to repair — the business doesn't exist to re-verify
  against), with the closure finding recorded in `terminalReason` so a future pass doesn't re-research it
  from scratch. Recommending a real, still-open replacement is out of scope for this bridge.
- **A garbage single-word title extraction bug can reach an already-`PUBLISHED` live record, not just an
  unpublished one — and it's a worse defect than the previously-documented generic-extraction-artifact
  case.** Real case (cards 101-200 continuation, batch 16, 2026-08-07): two sibling content cards for the
  same real business (The Canopy / Canopy Playspace, a Williamsburg baby/toddler play studio) were titled
  "New" and "And" — meaningless one-word fragments truncated from their real source page titles ("New
  Parent Workshops Williamsburg..." and "Baby and Mom Meetups Williamsburg..."). Both were `PUBLISHED`
  with zero blockers, so a family browsing the live site would have seen a card literally titled "New" or
  "And" with nothing describing what it is. This is distinct from the earlier "Camps" case (already
  documented above, in `cardBridgeRegistry.ts`'s comment on `title`) — that fragment was at least a real,
  meaningful category word; "New"/"And" aren't coherent at all. The same record also carried a wrong
  neighborhood (the real Williamsburg location was labeled "East New York," an unrelated, distant Brooklyn
  neighborhood) and a duplicate-content-card situation between the two siblings — three defects stacked on
  one live record. Fixed by renaming the canonical card to a real, descriptive title and correcting its
  neighborhood, then marking the duplicate sibling `BLOCKED_TERMINAL`. Worth treating any single-word or
  obviously-fragmentary title as its own trigger for closer review, independent of `blockerCodes`.
- **A directory or media site's own multi-result search-results page can be scraped and mistaken for a
  single business — this is a step further than the already-documented "real entity behind a bad source
  pick" case, and it means there is nothing left to repair.** Real case (cards 101-200 continuation,
  batch 19, 2026-08-07): a card titled literally "Psychology Today" had `sourceUrl`
  `psychologytoday.com/us/groups/ny/brooklyn?category=pregnancy-prenatal-postpartum` — Psychology Today's
  own CATEGORY SEARCH page, listing many unrelated therapist/group results, not a page for any one
  business. The card's own title is the tell: it's the directory site's own brand name, proof no singular
  real entity was ever identified during discovery. Contrast with the earlier, already-documented case (a
  `psychologytoday.com` directory page for ONE specific real business, e.g. a physical therapist's own
  listing) — there a real business sits behind a bad source pick and a better source can be found; here the
  source itself never named any one business, so there is nothing to find. Marked `BLOCKED_TERMINAL`, not
  `QUARANTINED` — no future re-research fixes this, the defect is structural to the source itself.
- **Multiple cards sharing a byte-identical wrong default value (not just a similarly-wrong guess) is a
  possible run-level pipeline bug, not independent per-card coincidence — worth flagging even without time
  to fix the root cause.** Real case (same batch): the "Psychology Today" card above and an adjacent card
  (Postpartum Resource Center of New York, a real Long Island nonprofit with zero connection to Brooklyn)
  shared the identical `latestRunId`, identical `createdAt`/`updatedAt` timestamps, AND the exact same
  wrong `neighborhoodGuess` value, `"East New York"` — despite describing two completely unrelated
  organizations. The same `"East New York"` value also turned up as a wrong-neighborhood defect on an
  unrelated card in batch 16 (The Canopy NYC, a real Williamsburg business). Three unrelated cards landing
  on the identical specific wrong value is a different failure signature than three cards independently
  guessing wrong in three different ways — it smells like a shared fallback/default path in a specific
  discovery run rather than three unlucky individual misses. Not enough evidence yet to name the exact
  code path (this bridge has no read access to the discovery pipeline's internals), but worth a targeted
  sweep for other cards carrying this exact value, and worth naming as a distinct kind of finding: value
  repetition across unrelated records is itself a signal, separate from whether any single card's guess
  is right or wrong.

- **A card's stored domain can belong to a DIFFERENT REAL COMPANY whose name merely shares a word — a fourth
  wrong-domain shape, and the only one in which nothing is fake.** Found 2026-08-08 (batch 40). A card titled
  "Camp Kidville UWS" was sourced to `camp.com`, the family-experience retailer CAMP — an entirely separate
  company from Kidville, sharing only the token "camp". Both companies are real, and the card names the right
  one: Camp Kidville is the genuine summer camp at Kidville Upper West Side, 205 West 88th Street,
  212-362-7792. Distinguish all four now: *off-topic contamination* (the entity was never real),
  *pipeline-guessed-wrong-domain* (the domain never belonged to the business), *domain hijacking* (Urban
  Dunes — the domain WAS the business's, then changed hands), and *token collision* (this). The danger is
  that this one is the hardest to see: `camp.com` serves a real, glossy, obviously-legitimate children's
  business, and CAMP's own location list names exactly one NYC store (Flatiron), so a card reading "Camp …
  UWS" looks like a textbook real-brand-fake-location fabrication. Quarantining on that reading would have
  deleted a real operating business. **Search for the card's own named ENTITY before ruling on what its
  domain serves** — already the rule for hijacking, and it generalizes: the sourceUrl is evidence about the
  pipeline, not about whether the business exists.
- **A multi-location franchise's bare ROOT DOMAIN as `sourceUrl` is a defect predictor, not a neutral fact.**
  Found 2026-08-08 (batch 40): all five root-domain cards in one batch (`sylvanlearning.com`,
  `codeninjas.com`, `c2educate.com`, `camp.com`, `completebody.com`) were defective, each in one of exactly
  two ways — a **borough-level duplicate** of a single real center already carried by a correctly-sourced
  sibling ("Sylvan Learning Manhattan" for the one real 200 W 86th St center; "Code Ninjas Brooklyn" for the
  one real Gowanus dojo), or a **fabricated location** naming a borough where the franchise has no branch at
  all (C2 Manhattan, Code Ninjas Manhattan, CAMP Brooklyn). That is structural, not luck: a root domain
  carries no location evidence, so whatever borough landed on the card was inferred rather than read. The
  per-location cards on those same hosts (`codeninjas.com/ny-gowanus`, `camp.com/locations/fifth-ave-nyc`)
  were correct. Fetching each brand's own location directory resolved five cards in five requests — do that
  before accepting any root-domain card's borough.
- **A card's `sourceUrl` can be a famous page reached by TOKEN-MATCHING one word of the business name — and
  because the host looks authoritative, every other heuristic passes it.** Found 2026-08-08; **25 cards**,
  most `PUBLISHED` with zero blockers. `en.wikipedia.org/wiki/Tiger` (the animal) for Tiger Schulmann's,
  `/wiki/Manhattan` for six Manhattan-named orgs, `/wiki/Downtown` for two Downtown-named ones, `/wiki/Dance`
  for a dance studio, `/wiki/West` for the West Side YMCA, `/wiki/Marlene_Dietrich` for the Marlene Meyerson
  JCC, `/wiki/Saint_Peter` for Peter Stuyvesant Little League, `/wiki/Asphalt_concrete` for Asphalt Green;
  `youtubekids.com` for six cards containing "Kids"; `nytimes.com` for three containing "NY". A family
  clicking "Asphalt Green Youth Tennis" landed on the article about road surfacing. **The reason this
  survives every other check is that the fields all look fine and the host looks authoritative** — one was
  even graded `sourceAuthorityGrade: "authoritative"`. The only tell is reading the actual URL. Most of the
  entities are REAL, so per the entity-before-domain rule these are wrong-domain cards, not contamination:
  block as `BLOCKED_REPAIRABLE` with the re-source target recorded, and terminate only where the entity
  itself cannot be identified. **The count grew every time another reference host was queried (3 → 15 → 25),
  so treat a `sourceHost` denylist query as the audit, not a spot check.** Root cause is in the read-only
  main app — written up as item 0 of `docs/classscout-core-recommendations.md`.
- **A negative result from a small sample is worth recording, but say the sample size loudly.** The same
  sweep's first 50 cards found zero off-topic contamination, and that was written up as a headline negative
  result — "the published pool is not where this defect concentrates". Continuing past 50 found the 25-card
  token-match cluster above. The original note was not deleted; it was marked superseded in place, because
  the useful lesson is that **50 was too small a sample to generalise from and the write-up did not say so
  loudly enough**, not that recording a negative result was wrong.
- **The physical-only prohibition is triggered by the ENTITY, never by the source domain — and it is easy to
  write down backwards even while acting on it correctly.** Caught 2026-08-08 by self-audit: six cards were
  correctly handled (real operators sourced to `youtubekids.com` by the token-match bug were set
  `BLOCKED_REPAIRABLE` for re-sourcing, which is right), but the recorded `terminalReason` said
  *"youtubekids.com is a categorically prohibited source type under the physical-only rule"* — which inverts
  the rule. `terminalReason` is the durable record the next pass reads, so **a wrong rule statement
  propagates even when the disposition was right**; a future reviewer following that text would start
  quarantining real businesses for having a social-media source. Corrected in place on both cards with the
  inversion named. The working test, stated once: *would this still be prohibited if the same business were
  described on its own website?* If yes, it's the entity (Outschool, an app's own store listing, a
  marketplace) → quarantine. If no, it's a bad source pick (Léman Manhattan sourced to an Amazon video
  storefront; Kids in Sports sourced to YouTube Kids) → re-source. Out-of-market is a separate ground and
  should be cited as such rather than smuggled in via the host — two Long Island cards on a `facebook.com`
  source were quarantined for being on Long Island, and their `terminalReason` says the Facebook host was
  explicitly *not* the reason.
  Two follow-on notes from auditing that fix, both cheap and both easy to get wrong. **(a) Check the whole
  pattern, not the instances you noticed** — a `sourceHost` scan across 28 platform/reference hosts confirmed
  only the two known cards carried the inversion, which is a real negative result rather than an assumption.
  **(b) Quoting a wrong statement verbatim inside its own correction makes future audits flag the CORRECTED
  card forever.** Both hits in that scan were the correction text quoting the error in order to name it. The
  quote is still worth keeping — a correction that doesn't say what it is correcting is much weaker — but any
  future grep for this phrasing must read the surrounding sentence before concluding a card is unfixed.
- **Wrong location guesses are not randomly distributed — they err toward the fashionable core, so the
  location a duplicate cluster is MISSING is predictable.** Measured 2026-08-08 across seven clusters
  resolved in one pass, and it held in every one. Penguin City Swim has a pool in Riverdale, the Bronx;
  eight cards existed and all eight said Manhattan or Brooklyn. Gjøa's clubhouse is at 850 62nd St in Sunset
  Park; six cards existed and all six said Bay Ridge, Dyker Heights or "South Brooklyn". Ferox has a park in
  DUMBO; five cards existed and none found it. Random error would sometimes land on the outer borough — this
  never does. Practical use: when reconciling a cluster against an operator's location list, **check the
  outer-borough and less-central sites first**, because those are the ones no card will have found and
  therefore the ones a surplus card should be repurposed onto.
- **CORRECTING a location and REPURPOSING a card are different moves — keep them straight.** Sharpened
  2026-08-08 on two superficially identical live cards. Goldfish Swim School's card claimed Brooklyn Heights;
  the operator has exactly ONE Brooklyn school (Gowanus), so the neighbourhood was **corrected** — the card
  was always about that school and merely said the wrong name. Take Me To The Water's card also claimed a
  neighbourhood the operator does not serve (Park Slope), but it has THREE Brooklyn pools, so no single
  correction existed; the card was **repurposed** onto a specific uncarded address (228 Duffield St). The
  claim in the `terminalReason` differs accordingly: "this was always X and was mislabelled" versus "this
  surplus card now represents X, which had no card". Writing the second as if it were the first would be a
  small fabrication.
- **`boroughGuess` is already carrying values that are not boroughs.** Found 2026-08-08 while blocking
  Goldfish's Long Island schools: three cards read `boroughGuess: "Long Island"` and a chain-level card reads
  `"NYC / Long Island"`. The Borough-taxonomy gap (Fort Lee NJ, Huntington LI, Westchester/New Canaan, now
  Centereach/Farmingdale/Garden City — four confirmations) is therefore not just a missing product decision;
  the field is being violated in the data today. Worth stating that way when the decision is finally made.
- **A pre-opening location is not a location.** Goldfish Swim School's UWS Broadway school is in
  pre-registration; it was deliberately NOT carded, because listing it sends families to a pool that has not
  opened. Same family of judgement as the confirmed-permanently-closed case (City Treehouse), at the other
  end of the lifecycle — a real brand's real future site is still not somewhere a child can go this week.
- **A raw HTML tag can reach the public `title`, and the text wrapped around it is usually real
  information.** Found 2026-08-08 across the library clusters: `Kew Gardens Hills <br> (temporary Location)
  Library (QPL)`, `Ozone Park <br> (closed For Renovations) Library (QPL)`, `Brighton Beach <br> (closed For
  Renovation) Library (BPL)` — the literal string `<br>` scraped out of a branch-list's markup. A scan of 742
  titles found exactly these three, so it is rare rather than systemic. **Don't just strip the markup**: two
  of those three branches really are closed for renovation, which is the more important finding and the
  reason both were blocked rather than tidied. Lifecycle judgements now confirmed at three points —
  pre-opening (Goldfish UWS Broadway), temporarily closed (these two branches, `BLOCKED_REPAIRABLE` since
  they reopen), permanently closed (City Treehouse, quarantined).
- **NYPL, Brooklyn Public Library and Queens Public Library are three legally separate systems** — NYPL
  serves Manhattan, the Bronx and Staten Island ONLY. Confirmed 2026-08-08 by a live card titled "New York
  Public Library Children's Programs" carrying `boroughGuess: "Brooklyn"`. Any card attributing an NYPL
  branch to Brooklyn or Queens is wrong on its face, no research needed. (Both of NYPL's only live cards were
  also sourced to `/events/programs/childrens`, the system-wide programme index — a programme, not a branch —
  while 61 correct per-branch cards sat unpublished behind them.)
- **A substring match on an activity label finds tags inside other words — "Art" lives inside
  "mARTial".** Found by PR review 2026-08-08 and reproducible with one title: `alignActivityTypes` step 1
  used `title.toLowerCase().includes(label)` and returned the FIRST matching candidate in array order, so
  "Brooklyn Martial Arts Academy" with candidates `["Art", "Martial Arts"]` picked **Art** — and then
  dropped the real "Martial Arts" tag, because Art is in a different cluster. Two independent faults:
  substring instead of whole-word, and first-match instead of most-specific. Fixed with a
  boundary-aware match plus longest-label-first. **The length tie-break is right in step 1 and WRONG in
  step 2** — sorting the keyword-pattern matches by label length made "Park Slope Academy Jiu Jitsu Kids"
  resolve to "Outdoor Activities" (the `park` keyword firing on the neighbourhood name) over "Martial
  Arts". Label length proxies for specificity only when the title literally contains the label. Both
  cases are now regression-tested.
- **`fingerprint`, not `contentCardId`, is what the dedupe index is on — and every field it hashes is
  writable through this bridge.** Raised in PR review 2026-08-08. `computeContentCardIdentity` hashes
  title + sourceUrl + categoryHint + boroughGuess + neighborhoodGuess, and the real collection's unique
  index is `{fingerprint, kind}`. All five are writable, so editing ANY of them left the stored
  fingerprint describing a card that no longer exists: discovery re-encounters the corrected page,
  computes a different hash, matches nothing, inserts a duplicate. Re-sourcing made it easy to notice
  but it was already true of the other four before `sourceUrl` became writable. `applyCardBridgeWrite`
  now recomputes `fingerprint`/`normalizedTitle` whenever a basis field changes, and **blocks the write
  with a named collision** when the new fingerprint already belongs to another card — that collision
  means the two records are the same card, which is worth surfacing rather than letting the unique index
  reject it at driver level. **`contentCardId` is deliberately left stale** even though it is literally
  `cc-${fingerprint}`: it is the primary key, referenced from the audit log and from anything already
  linked to the card, so recomputing it would be a delete-and-recreate — which this bridge does not do.
  Don't "fix" that mismatch later by mutating the key.
- **When a cluster carries several names for one operator, check whether any of them belongs to somebody
  else — confirmed twice now, so treat it as routine.** "United Soccer Academy Brooklyn" on
  `brooklynunitedacademy.com` and "Lil' Kickers Manhattan" on `manhattankickers.org` were both live, and both
  are the real names of separate, unrelated companies. A duplicate wastes a family's time; this hands them a
  different business than the one they searched for.
- **A DELIVERY MODEL can occupy `neighborhoodGuess`, and it is not the same as a wrong neighbourhood.**
  Found 2026-08-08: "Park Slope / mobile", "Mobile / Brooklyn", "NYC-wide", "Multiple Brooklyn". The field
  holds a *category of answer* rather than an answer. Distinguish it from the compound-neighbourhood case —
  and note that "mobile" appearing there is NOT by itself proof of the prohibited no-fixed-venue business:
  Brooklyn Robot Foundry has a real Gowanus studio (98 4th St) *and* runs mobile programmes, which is the
  hybrid case — keep the card, drop the mobile framing.
- **A franchise TERRITORY is not an address.** Brooklyn Robot Foundry's own site lists "NY – Manhattan East"
  and "NY – Manhattan Downtown" alongside its real studios. Surplus cards were deliberately not repurposed
  onto those, because a territory names a sales area, not a place a child attends. Same discipline as the
  retitle-only-onto-an-identified-location limit.
- **The community a programme serves and the address it operates from are different facts, and
  `neighborhoodGuess` is the second one.** Riverside Hawks describes itself as a Harlem community programme
  and every one of its four cards said "Upper West Side / Harlem"; the Stone Gym a child actually walks into
  is on Claremont Avenue, in Morningside Heights. Both statements are true; only one belongs in the field.
- **The token-match source bug manufactures CROSS-HOST duplicates, which a per-domain sweep structurally
  cannot find.** Discovered 2026-08-08 on `riverside.com` (which is *Riverside*, podcast and video recording
  SaaS). Two of its three live cards — "Riverside Hawks" and "Riverside Hawks Youth Basketball" — duplicate
  a card that already exists, correctly sourced, on `riversidehawks.org`. Because the pair sits on two
  different hosts, grouping by `sourceHost` will never put them side by side however carefully it is done;
  only searching the ENTITY finds it. Practical consequence: a token-matched card is **terminal, not
  repairable**, whenever the correctly-sourced card already exists — there is nothing to re-source it to.
  Check for a correctly-sourced sibling before recording a re-source target.
- **A FRANCHISOR's own site is a root-domain card one level up from a franchise, and it is worse.**
  `musictogether.com` is the licensing network's homepage, offering a "Class Locator"; the NYC classes are
  run by independent licensed centres, each its own business. A franchise's root domain at least belongs to
  a company with branches; a franchisor's belongs to a company with no venues at all. Terminal where the
  card names no centre ("Music Together Citywide NYC"), repairable where it names a place that a specific
  licensed centre must then be identified for — and note that a centre teaching in rented rooms would still
  fail the physical-location test on its own merits once found.
- **A DIVISION is not a location.** Kaufman Music Center's Lucy Moses School and Merkin Hall are parts of
  one building at 129 W 67th St; Mark Morris's "Dance Center Kids" and "Student Company" are programmes
  inside 3 Lafayette Avenue. Same rule as program-not-a-location, one level of organisational structure up:
  a named school, hall, academy or company inside a single venue does not earn its own card.
- **A homepage naming ONE address is not evidence the operator's other locations are fake — check before
  retiring.** Found 2026-08-08: The Painted Pot's homepage title and footer give only 188 5th Avenue (Park
  Slope), so its "Carroll Gardens" card looked like textbook real-brand-fabricated-location. An independent
  check confirmed 339 Smith Street is a genuine, currently-operating second studio. Quarantining on the
  homepage alone would have deleted a real business. Same discipline as entity-before-domain, applied to
  locations: **the absence of a location from the homepage is not evidence of its absence from the world.**
- **A COMPOUND card can be the ideal repurpose target, not just a duplicate.** Modern Martial Arts NYC has
  three schools; two had correct cards and the third (UES, 220 E 86th St) had none, while the surplus card
  read "Upper West Side / Tribeca" — compounding exactly the two that were already covered. Compound
  neighbourhoods have shown up throughout this sweep as duplicates to retire; check first whether the
  location the compound is NOT naming is one that lacks a card.
- **A cluster with FEWER cards than real locations is the genuine `POST /split` case — and it is rare.**
  Treasure Trunk Theatre has four locations and three cards, all three correct. Almost every other cluster in
  this sweep had surplus cards, which is why retitling kept beating splitting; this is the shape where it
  does not. Recognise it by counting before reaching for either tool.
- **Step 1 of the loop must filter `kind: "content"` — the oldest-first queue is choked with `repair`
  stubs.** Confirmed 2026-08-08: ALL 16 globally-oldest records are auto-generated `kind: "repair"`
  documents (`repair-<hash>-<blockercode>` ids, `internal://classscout/source-seed/…` URLs, already
  `BLOCKED_TERMINAL`). Independently found by a concurrent session too. Without the filter the loop spends
  its entire budget on machine-generated stubs and never reaches a real card.
- **The bridge REJECTS `state: "PUBLISHED"`, and it is right to — even when you are undoing your own
  restriction.** Hit 2026-08-08. SpeakItaly NYC was pulled off PUBLISHED by this loop earlier the same day
  purely because it was sourced to somebody else's directory listing; once re-sourced to the provider's own
  site, restoring it felt like completing a repair rather than new exposure. The bridge refused: publishing
  requires the main app's full gate (dedupe, schema validation, image pipeline, safe-publish flags), which
  this bridge deliberately does not replicate. **Set `REVIEW_READY` and let the gate decide.** The rule is
  not "don't increase exposure on balance" — it is that the publish judgement isn't this bridge's to make.
- **A card can assert a children's offering that its own source does not support — a distinct shape from
  contamination, wrong location, or fabrication.** Named 2026-08-08: NYC Footy is a real organisation and it
  really is soccer, but it presents as an ADULT social league (leagues by borough, no children's programming
  on the front page) while the card is titled "NYC Footy Kids Clinics". The entity is real, the category is
  right, the location is vague-but-not-wrong — and the children's claim is simply unevidenced. Block rather
  than quarantine (the clinic may exist), but do it BEFORE the card is live, not after.
- **The token-match bug can reach a FOREIGN-LANGUAGE site in another country — and the entity is still
  usually real.** Found 2026-08-08: "Zing! Kids Fitness", claiming Manhattan, was sourced to `zing.cz`, a
  Czech-language VIDEO GAMES website (PlayStation, Xbox, Nintendo). The first word of the business name
  resolved to whatever ranks for it. Entity-before-domain is what stopped this being a quarantine: Zing! for
  Kids is a genuine NYC children's fitness business at 1732 1st Ave, its real site being `zing-kids.com`.
  **However absurd the host, search the named entity before ruling** — and since `sourceUrl` is writable
  now, these are fixable rather than merely documentable.
- **A discovery run can have a signature, and "scraped the programme hub instead of the venue" is one of
  them.** The 2026-06-28 run produced three programme-index cards in two consecutive batches — the NYC Parks
  youth-sports index, a CityParks registration page, and NYCFC's `/youth/programs` — plus a franchise
  territory page. When several cards from ONE `latestRunId` share a defect *shape* rather than a defect
  *value*, that is a run-level signal worth naming; check the rest of the run for the same shape rather than
  handling each as its own finding.
- **An administrative office is not a location, and writing it is worse than leaving the field vague.**
  Sharpened 2026-08-08 on NYC Impact Volleyball: the only findable address is 6029 Putnam Ave, Ridgewood — a
  back office — while its actual sessions are open gyms in rented school and community halls. Putting
  "Ridgewood" in `neighborhoodGuess` would send a family to a door they cannot use. Fourth deliberate
  non-action of the sweep, alongside City Parks Foundation, Five Points Academy and Fit Soccer Kids.
- **A wrong phone number is worse than no phone number — clear it rather than guess.** Found 2026-08-08 on
  a LIVE provider: Kinder Prep Montessori carried `6158583658`, a **Nashville, Tennessee** area code, matching
  none of the three numbers on the operator's own site. Because the operator runs five Brooklyn locations and
  maps no number to this one, there was no evidenced replacement — so the field was cleared and the three
  real numbers recorded in `reason` for the next pass. An empty field is an honest absence; a wrong one sends
  a parent to a stranger.
- **Fixing a record's copy does not re-run its derivations.** `alignActivityTypes()` fires only when a write
  touches `activityTypes`/`primaryActivityType`. An enrichment write that rewrites descriptions and address
  leaves a nine-tag activity list exactly as it was. After enriching a `providers` record, check the derived
  fields separately — passing the existing array straight back through the write path is enough to
  re-derive it.
- **Check a record against ITSELF before opening a browser.** Ballet Tech's `address` field said "Flatiron"
  and its `neighborhood` field said "Midtown". Two fields of one record contradicting each other is a defect
  resolvable with no research at all, and it is free to look for.
- **A defect found in one field is a defect to look for in every field of the same shape — the scan defines
  the finding, so a narrow scan produces a confidently wrong count.** The leaked-prompt sweep reported "35
  live records" because it read `shortDescription`/`longDescription`. The identical string was ALSO the whole
  value of `recurringPrograms[].timeText` on **48 further records**, two of which had already been "fixed" in
  the description pass and so read as clean while still showing a family the pipeline's own instruction where
  the class time belongs. Total was 74 records, not 35. Cleared pool-wide, field emptied rather than invented.
- **A parent organisation's HEADQUARTERS address can overwrite a venue's own, and the footer is where it comes
  from.** Prospect Park Zoo was filed under *Fordham, the Bronx*: 2300 Southern Boulevard, Bronx is the
  Wildlife Conservation Society's HQ, printed in the footer of every WCS site page, and the extraction took
  the footer instead of the venue. Distinct from the administrative-office rule (one business's own back
  office) — here a multi-site parent's HQ moved a different site to another borough. Check it wherever one
  parent runs several venues.
- **A non-local area code is not by itself evidence of a wrong phone number — check whose number it is.** Two
  cards in one batch, opposite outcomes. Irish Arts Center carried a 202 (Washington DC) number matching
  nothing on its own site: CLEARED, not replaced. Doc's NYC Lacrosse carried a 617 (Boston) number — published
  on the operator's own front page as "the Doc's Hotline": KEPT. A mobile hotline keeps its original area code
  forever; the test is whether the operator publishes it, not where the digits geolocate.
- **Check for a correctly-located sibling BEFORE ruling on a wrong location — it changes the verdict, not just
  the paperwork.** Karate City's card claimed the Upper East Side and looked like a straightforward
  real-brand-fabricated-location correction to Hell's Kitchen (525A W 52nd St). A sibling card already carried
  that dojo correctly, so correcting this one would have produced two cards for one dojo; it was RETIRED as a
  duplicate instead. The exactly-one-real-answer rule tells you whether to correct or quarantine; the sibling
  check tells you whether "correct" was ever the right verb.
- **A site-wide navigation block is a field-filling hazard for every record scraped from that site — and the
  confirmation trick is free.** Long Beach Public Library's `address` read `"570-6685 Send Email Dr."` and its
  `phone` was the MAYOR's office. longbeach.gov renders the city's full elected-officials directory on every
  page, so the "street" is the tail of a councilmember's phone number (562-570-**6685**) with the adjacent
  words "Send Email" and a suffix bolted on. **If a suspect value still appears on the site's 404 page, it
  came from the furniture, not the content** — that is how this was confirmed. Both fields cleared, since the
  library's own locations page 404s and no verified address existed to write.
- **"Kids" in an AMENITY name is not evidence of a children's programme.** Equinox Sports Club's card was
  titled "Kids Programs"; the club's only child-related offering is a "Kids Club", which is drop-off childcare
  for adult members while they train, listed between the spa and the coat check. Searching its own page for
  youth/junior/teen/camp/family returns nothing. Subtler than the catalogued CompleteBody case, which had
  nothing child-related at all — here the word really is on the page, attached to the wrong kind of thing.
- **An operator's own location finder beats a search summary, and the gap between them is where fabricated
  locations survive.** A web search asserted Kidville runs UES, UWS, Chelsea, TriBeCa and Park Slope studios;
  Kidville's own finder lists exactly two in North America (205 W 88th St and Montclair NJ). The summary was
  stale marketing copy, and believing it would have kept a fabricated Upper East Side card live.
- **Two records differing only in phone-number PUNCTUATION are the same record twice — and that is a
  mechanical test nobody has run.** Breakaway Hoops had two records with an identical name and the numbers
  `6467762021` and `646-776-2021`. Comparing phones normalised to digits would find this whole class of
  duplicate across the pool with no research at all.
- **The `providers.phone` field has held Unix timestamps and the city switchboard.** Found 2026-08-08 in a
  pool-wide scan: nineteen live records carried 10-digit epoch seconds (`1742850639` = 2025-03-24,
  `1672214040` = 2022-12-28) where the phone number should be, and eighteen carried `311`, New York City's
  government services line. All 42 undialable numbers were **cleared, never replaced** — a field a parent
  cannot dial has no value, and inventing a substitute is worse. **Validate a phone by SHAPE, not by a
  denylist of area codes**: strip a trailing extension first, then apply NANP structure (ten digits; neither
  the area code nor the exchange may start 0 or 1). A blunter rule flagged `212-569-6200 ext. 2274`, which is
  perfectly dialable.
- **In a bulk sweep, let one rejected field fall back rather than abort the record.** The copy-quality gate
  refused a description that decoded cleanly but still contained "skip navigation" — correctly. Aborting
  there would have cost that record its phone and neighbourhood fixes too. The sweep now retries without the
  copy fields and writes the reason into `reason`, so the record is improved and the remaining problem is
  recorded rather than hidden.
- **Draw the mechanical/manual line explicitly, and say where it falls.** Empty `neighborhood` went 399 →
  312 because only 87 records had the answer already sitting in their own `address` field; the other 312
  need research. Reporting "399 → 312" with that explanation is honest. Reporting "87 fixed" alone would
  imply the rest were fine.
- **Walk the queue to learn the defect SHAPES, then query the shapes to fix them at scale.** Established
  2026-08-08 after ten hand-worked `providers` records against a pool of 1,087 — roughly 217 batches at that
  rate. Ten records bought a catalogue of signatures; a single scan then counted every one of them across the
  whole pool, and **one scripted pass fixed 924 records** (missing `primaryActivityType`: 921 → 0; over the
  3-tag cap: 284 → 0) by passing each record's existing tags back through `alignActivityTypes()`. No new
  facts, no per-record judgement — the derivation already existed and was tested; nobody had invoked it.
  Hand-walking is for learning, not for volume.
- **A scan needs per-page retries and an explicit failed-page list — `except: break` produces a partial scan
  that reads as a complete one.** Did this to myself 2026-08-08: the first providers scan reported 125 of
  1,087 with tidy-looking counts, having swallowed a transient error at offset 125. This is the same
  silent-truncation failure already written down for partition-based enumeration, which is the point —
  **writing the rule down is not the same as following it**, so build the retry into the scan rather than
  relying on remembering.
- **The internal-jargon leak has a worst case: an LLM prompt published as the description.** 35 live
  `providers` records read, in full, *"Extract age or grade evidence from the official program page.."* — the
  pipeline's instruction to itself, in the field a parent reads. Related, same scan: **18 live records give
  `311`, New York City's government switchboard, as the provider's phone.** When auditing copy, grep for
  instruction-shaped text (`Extract …`, `Summarise …`, trailing `..`), not just for known bad strings.
- **Cluster size alone is not evidence of a defect — a genuine multi-site operator produces a large, CORRECT
  cluster.** The necessary counterweight to the letsgobaby finding above, established the same session
  (2026-08-08). `laparks.org` carries 30 cards on a municipal `.org` domain, which looks like exactly the same
  shape; it is the City of LA Department of Recreation and Parks with one card per real facility (Hansen Dam
  Recreational Lake, Lanark Pool, Sepulveda Pool, Griffith Park Boys Camp, Camp Seely…), on a legitimate
  LA-tenant source. 28 of the 30 were left untouched — that is the one-card-per-location rule working
  correctly at scale. Only the two sitting on the department's own homepage were retired. Establish what the
  host IS before counting its cards against it.
- **When a directory's listings really are children's activities, the "directory is a source, not a card
  host" ruling splits three ways rather than applying wholesale.** Worked out 2026-08-08 on
  `activityhero.com` (a real US kids-activity marketplace), as distinct from letsgobaby.co (restaurants,
  where every card was wrong for the same reason). Terminal for cards that ARE the directory's own browse
  pages — they name no single business, so there is nothing to re-source to. **Repairable** for cards that
  name a specific provider but were scraped off a multi-provider browse page: a named entity exists to go and
  find, so retiring them would discard real businesses. And a live `PUBLISHED` card sourced to someone else's
  directory listing (SpeakItaly NYC, a genuinely real provider) comes off `PUBLISHED` with a re-source target
  recorded — real entity, bad source pick, not contamination.
- **A whole directory site can be ingested wholesale — check the SIZE of a suspicious host's cluster before
  assuming it is a handful of cards.** Found 2026-08-08: `letsgobaby.co` (Let's Go Baby, a directory of
  family-friendly NYC restaurants) had **795 content cards**, one per restaurant, bar, brewery, beer garden,
  steakhouse or cinema, all from one backfill run. The `categoryHint` field held the proof — 51 of its 53
  distinct values are cuisines (Bar, Brewery, Steakhouse, Diner, Ethiopian…), so a family filtering by
  category would have been offered a brewery. All 795 went to `BLOCKED_TERMINAL`, not per-card quarantine:
  every page on the host is a restaurant, so the defect is structural to the source and no re-research
  changes it. **Owner directive on the right outcome for a directory like this (2026-08-08): register it as a
  DISCOVERY SOURCE — a place to look for candidates — not as a host whose pages become cards.** That is the
  general answer for a curated directory whose listings are real but are not themselves activities.
- **Partition-based enumeration silently UNDERCOUNTS: any partition returning exactly 25 rows has hit the
  `limit` cap and been truncated.** Learned the hard way 2026-08-08 on the cluster above. Four levels of
  partitioning (`state` × `boroughGuess` × `neighborhoodGuess` × `categoryHint`) reported **706 cards with
  zero remaining capped partitions** — which reads as complete, and was not. Retiring those 706 and
  re-querying returned 25 more, and it took four further rounds of loop-until-nothing-new to reach 795.
  **Partitioning tells you a cluster is AT LEAST this big; only the seen-set loop tells you it is empty.**
  Two figures already written down are therefore lower bounds: the reference-host audit's "980 cards / 557
  hosts", and the cluster scan's "199 hosts / 684 live cards" (its per-host counts capped at 25, so a
  795-card host read as "25"). The `offset` parameter added to the rows endpoint fixes this properly but is
  **inert until the branch merges**, since production deploys from `main`.
- **The rented-venue rule is TWO-part, and the second part is "does the operator have any other card?"**
  Sharpened 2026-08-08 by a case that cuts the opposite way from The Art Farm. Steve & Kate's Camp runs all
  five of its NYC campuses in school buildings rented for the summer (Trevor Day ×2, the Cathedral School,
  Brooklyn Heights Montessori, Berkeley Carroll) — textbook seasonal rental, the exact shape that got The Art
  Farm's `/summer-camp-uws/` card retired. It was KEPT, one card per campus. The difference is not the venue
  but the cost of retiring: The Art Farm owns 431 E 91st St and is already carded there, so its camp cards
  were surplus; **Steve & Kate's has no venue of its own anywhere — renting campuses for the season IS the
  business**, and retiring these removes a real operating camp from the pool. A seasonal-only operator's
  rented campus is its real location; a year-round operator's seasonal rental is not.
- **A vague `neighborhoodGuess` is sometimes the honest one — don't sharpen it into a lie.** Recorded
  2026-08-08 on two cards in one pass. City Parks Foundation keeps "NYC-wide" because its office at 830 Fifth
  Ave is not where children go and its programmes genuinely run across dozens of parks; Five Points Academy
  keeps borough grain because 148 Lafayette St sits on the SoHo/Little Italy/Chinatown boundary and sources
  disagree. In both, a specific value would be *less* true than the vague one. The fix for the first is a
  per-park split, not a better guess. Sharpening borough grain is usually right — but check that a single
  answer exists before writing one.
- **The rented-venue test is about the PROGRAMME, not the freehold: does the operator run an ongoing
  programme at this address?** Sharpened 2026-08-08 after two clusters took opposite outcomes for the right
  reason. The Art Farm's `/summer-camp-uws/` was retired — the Calhoun School's building, rented for eight
  weeks. Physique Swimming's SEVEN pools are all in other people's buildings too (Léman Prep ×2, Dunlevy
  Milbank Center, Yorkshire Towers, Congregation Beth Elohim, BronxWorks CMCC, Riverdale Neighborhood House)
  and every one was KEPT, because Physique publishes a year-round weekly schedule at each and a swim school
  without its own pool is the ordinary model for the trade. Ownership is not the question; a continuing
  programme at a fixed address is.
- **Three byte-identical cards can carry three DIFFERENT fabricated neighbourhoods — `neighborhoodGuess` is
  not derived from the source page.** Found 2026-08-08 (PlayGroup NYC): three cards with the same title
  ("Social", truncated from "Social Skills Groups") and the same `sourceUrl` (`/social-skills-groups`)
  claimed **Allerton, Bedford Park and Baychester** — three unrelated Bronx neighbourhoods, for an operator
  whose only two locations are in Park Slope and Greenwich Village. This is a stronger signal than the
  earlier "East New York" finding: that was unrelated cards *sharing* one wrong default, this is identical
  cards *diverging*. Identical input cannot produce three different correct answers, so the field is being
  generated rather than read. Treat a neighbourhood value as unverified by default, however specific it looks.
- **A cluster can misname the business on most of its cards, and one of those names can belong to a
  DIFFERENT REAL COMPANY.** Found 2026-08-08: Brooklyn United Academy's four cards were titled "Brooklyn
  Soccer Academy", "Brooklyn United Youth Soccer Club", "United Soccer Academy Brooklyn" and the correct
  "Brooklyn United Academy". The third is the dangerous one — United Soccer Academy is a real, separate
  provider, so that card silently redirects a family from one business to another. Earlier name fabrication
  (CompleteBody Kids) was a single title; when the MAJORITY of a cluster misnames the operator, pick the
  card carrying the real name as canonical and check whether any of the wrong names is somebody else's.
- **A per-location-looking PATH can point at a venue the operator merely rents — a real address on the page
  is not evidence of a location belonging to the business.** Found 2026-08-08 (The Art Farm). Three of five
  cards carried deeper paths than the canonical root-domain card, and `/summer-camp-uws/` even printed a real
  street address: "UWS CAMP LOCATION: Calhoun Lower School, 325 W 85th St". The address is genuine and the
  camp genuinely runs there — the building is the Calhoun School's, rented for eight weeks. Same for the
  after-school clubs inside PS 6 and PS 171. The Art Farm has exactly one venue of its own, 431 E 91st St.
  This is the sharpest case yet for **running the program test BEFORE the path-depth tie-breaker**: ask whose
  building it is, not how deep the URL goes.
- **Precision in a wrong claim is an aggravating factor, not a mitigating one.** Named 2026-08-08 after a
  batch where surplus cards in the same cluster took two different outcomes for exactly this reason.
  "Brooklyn AYSO Region 702" was QUARANTINED while four equally-surplus siblings ("Brooklyn AYSO", "Brooklyn
  AYSO Region 473" at borough grain) were merely retired: a vague card wastes a family's time, but "Region
  702" is a specific, checkable-looking fact that is not one — the source is Region 473's own site and no
  Region 702 exists. Same call put "Coney Island Gymnastics" in quarantine while its two vague siblings got
  `BLOCKED_TERMINAL`. Don't let a card's confident specificity read as credibility.
- **A wrong `neighborhoodGuess` can be derived from the BRAND'S OWN NAME.** Found 2026-08-08: a surplus
  Prospect Gymnastics card carried `neighborhoodGuess: "Prospect Heights / Brooklyn"`, but the operator's two
  gyms are in Ditmas Park and Bed-Stuy — "Prospect" is in the company name, not on a map of its locations.
  This is the token-match bug (first word of the business name resolved to whatever matches it, the
  merriam-webster/Wikipedia sourceUrl mechanism) surfacing in a DIFFERENT FIELD. Check for it by name
  whenever a brand name happens to contain a place word.
- **A league that plays on public fields is NOT caught by the no-fixed-venue prohibition.** Resolved
  2026-08-08 for Brooklyn AYSO (every fall game at the Prospect Park Parade Ground) and Gjøa Youth Soccer
  (matches spread across the Parade Ground, Pier 5, Socceroof, J.J. Byrne, Red Hook, plus its own clubhouse
  at 850 62nd St). Neither owns its pitches. The prohibition exists for a business with no location of its
  own *at all* — the in-home tutor network — not for one whose children reliably attend one identified
  place. Both were kept at neighbourhood grain; for the Parade Ground the neighbourhood was taken from NYC
  Parks' own filing (Park Slope) rather than guessed.
- **A sweep must GROUP BY DOMAIN before it judges, not screen a page and move on.** Found the hard way
  2026-08-08 during the PUBLISHED sweep: page 1 recorded "Koko NYC Brooklyn" and "Brooklyn City FC Academy"
  as clean, and both turned out to have duplicate twins — sitting on page 2. Nothing on either card reveals
  a sibling exists, so a page-scoped screen *cannot* catch them however carefully it is done; only a
  `filter={"sourceHost":...}` lookup can. This is the same order-dependence the per-domain sweep was
  invented to remove, quietly reintroduced by screening in page order. Both misses were corrected in the
  same session and their `terminalReason` entries say so.
- **When the program-not-a-location test would strand a real business at zero live cards, retitle onto its
  confirmed address instead of retiring it.** New tension, resolved 2026-08-08: "Fastbreak Sports Flag
  Football" is a textbook program card, but its only sibling had already been quarantined as a fabricated
  location, so retiring it would have removed a real operating business from the pool entirely. Its own
  contact page gives exactly one address (1629 1st Ave, Upper East Side), so the card was retitled onto
  that. **The escape hatch requires an identified location** — with none, keep the card and flag it rather
  than retire it into a gap.
- **Within a duplicate cluster, the card whose `sourceUrl` is a per-location path is canonical and the
  root-domain copies are the duplicates — a mechanical tie-breaker, no judgement needed.** The corollary of
  the root-domain rule above, confirmed 2026-08-08 (batch 41) on five hosts at once. SwimJim is the clean
  experiment: 8 cards, 4 carrying a real per-location path and 4 carrying the bare root; every per-location
  card was correct and every root-domain one was a duplicate or a location-less chain card. Use this before
  spending research on "which of these is the real one."
- **A "program" is not a location — a card differentiated only by an activity or audience qualifier is a
  duplicate.** Found 2026-08-08 (batch 41), 7 instances in one batch: "JCC Manhattan children's birthday
  parties", "Textile Arts Center **Kids**", "Brooklyn Brazilian Jiu Jitsu **Kids**", "Private Picassos
  **Birthday Parties**", "Asphalt Green **Basketball Foundations**". Each reads like a legitimate distinct
  offering, which is what makes it slip through. The tell: the token distinguishing it from its sibling names
  an activity or an audience, **not a place**. One card per real physical location means a venue's program
  menu is card content, not more cards.
- **Before reaching for `POST /split`, check whether the cluster already has enough cards to cover the real
  locations — if it does, RETITLE the surplus onto the missing location instead.** Sharpened 2026-08-08
  (batch 41), extending the batch-37/38 "check for existing children first" note. Three clusters had both
  surplus vague cards and real locations with no card at all, and were fixed by editing existing documents:
  MatchPoint NYC's two compound "Coney Island / Bensonhurst" cards became the two real clubs (2781 Shell
  Road; 9000 Bay Parkway), closing a split candidate deferred in an earlier pass **without a single split
  call**; Private Picassos' borough-level card became the real Clinton Hill studio (293 Grand Ave); Asphalt
  Green's compound card became the Battery Park City center (212 North End Ave). Split only when there are
  genuinely fewer cards than confirmed locations. **The limit matters as much as the technique: retitle only
  onto a location the evidence actually identifies.** It was deliberately NOT applied to SwimJim (two real
  UWS pools, but the surplus card says nothing about which) or Brooklyn BJJ (four real schools, seven cards,
  none location-specific) — inventing the assignment would be fabrication dressed as a fix, so those were
  recorded as split candidates instead.
- **Clearing a blocker needs the blocker's PREMISE to be false, not merely the card to be real.** Named
  2026-08-08 (batch 41) after a batch where 12 blockers were cleared and one was deliberately kept. The
  clearances were all `low_source_trust` sitting on an institution's own official domain — the premise
  ("this source is untrustworthy") was simply wrong. DNA Learning Center's `missing_schedule` was left in
  place even though the camp is real and correctly located, because the schedule genuinely is not on the
  source page: the premise is true. "The card turned out to be real" is not by itself a reason to clear
  anything.
- **Fabrication can live in the TITLE, not just in a location or category field.** Found 2026-08-08 (batch
  40): "CompleteBody Kids / Kids Sports NYC" welds a real **adults-only** gym brand (its own site: "Premium
  Gym NYC — 5 Locations", none on the UWS, no children's programming anywhere) to a second name the source
  never mentions, prefixed "Kids". Every previously catalogued fabrication sat in a field a family reads
  second; this one is in the field they read first. Both copies were quarantined rather than deduplicated —
  when neither copy describes a real children's provider, "which is canonical" is the wrong question.
- **What decides between CORRECTING a wrong location and QUARANTINING the card is whether research yields
  exactly ONE real answer.** Sharpened 2026-08-07 (cards 201-300, batch 21) after three cards in a single
  batch hit the same real-brand-wrong-location shape and correctly took two different outcomes. Sylvan
  Learning's card claimed the Upper East Side; research found exactly one real Manhattan center (200 W
  86th St, Upper West Side) — one unambiguous answer, so the neighborhood was CORRECTED and the card kept.
  Tutu School's two cards claimed Brooklyn Heights and Williamsburg; the franchise's own locations page
  lists neither, and for the Brooklyn Heights one, TWO real studios (Dumbo, Boerum Hill) sit in the same
  11201 zip as the claim — so the card is plausibly a mislabel of one of them, but picking between two
  equally-plausible real candidates would be fabrication. Both were QUARANTINED, with every confirmed real
  location recorded in `terminalReason` for a future split pass. Zero real answers and several real
  answers both mean quarantine; only exactly one means correct. This keeps the real-brand-fake-location
  pattern from becoming an excuse either to guess or to discard real businesses wholesale.

## The core system's listing-maintenance spec is now part of the requirements (2026-08-08)

The core system handed this repo a listing-maintenance specification — what a reviewer looks for, and what
they collect. It lives in **`docs/listing-maintenance-requirements.md`**, recorded in full with a
field-by-field map of what this bridge can persist, what it can only note in prose, and what needs schema
work in the read-only main app. Read it with `docs/card-improvement-process.md`.

Four things from it that change day-to-day behaviour:

- **Adopt its four verdicts**: `confirmed` / `corrected` / `needs_human` / `should_not_exist`. **`needs_human`
  is the one this repo was missing** — it is what every "deliberate non-action" here actually was. Use it
  freely: *a listing correctly escalated costs minutes; a listing confidently rewritten wrong costs a family.*
- **`confirmed` must name the fields checked.** A confirmation of nothing in particular is not a confirmation.
- **Never treat a missing price as free.** The spec's headline finding is that **97.3% of the catalog is
  priced at zero** because the field defaults to `0` and cannot distinguish "free" from "not found". This
  bridge has no price field at all, so price findings go in `terminalReason` — but never write or infer one.
- **Its top rule is one this repo reached independently**: search for the ENTITY, not the domain. Its worked
  example is Camp Kidville on `camp.com`; this repo's is Zing! for Kids on `zing.cz`, a Czech video-games
  magazine. Both businesses are real and both would have been deleted by judging the domain.

**The gap the spec exposed in this repo's own practice, recorded because it was real:** an entire session ran
239 writes to `contentCards` and **zero to `providers`** — and `address`, `phone`, `email`,
`shortDescription`, `longDescription`, `recurringPrograms`, `ageRanges` and `image` exist ONLY on `providers`.
A loop that stays in `contentCards` can fix identity, location and source, and cannot do the enrichment
mandate at all. **If a run has not written to `providers`, step 1 of the loop was not followed.** The same
session also left `categoryHint` null on every card of three maintenance runs despite it being writable and
explicitly named in the content-quality directive.

## Before you write anything real

1. Read `docs/card-improvement-process.md` in full — it is the binding process spec (selection order,
   the verification checklist, the three decision matrices, the explicit boundaries on what this bridge
   is and isn't allowed to do).
2. Confirm `MONGODB_DB_NAME` on whatever deployment you're pointed at (see above).
3. Dry-run before every apply. No exceptions, no "this one's obviously fine."
