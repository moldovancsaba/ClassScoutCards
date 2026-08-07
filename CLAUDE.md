# Working rules — ClassScout Cards (card-bridge)

These instructions OVERRIDE any default behavior. Read this file before touching anything in this
repo — most of what looks like a design choice here was a hard-won lesson from a real debugging
session, not a preference, and re-deriving it costs real time.

## What this repo actually is (as of 2026-08-06)

Two things live in this one repo, and they are unrelated:

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

## Before you write anything real

1. Read `docs/card-improvement-process.md` in full — it is the binding process spec (selection order,
   the verification checklist, the three decision matrices, the explicit boundaries on what this bridge
   is and isn't allowed to do).
2. Confirm `MONGODB_DB_NAME` on whatever deployment you're pointed at (see above).
3. Dry-run before every apply. No exceptions, no "this one's obviously fine."
