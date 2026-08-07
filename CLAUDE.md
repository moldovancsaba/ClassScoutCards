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

## Before you write anything real

1. Read `docs/card-improvement-process.md` in full — it is the binding process spec (selection order,
   the verification checklist, the three decision matrices, the explicit boundaries on what this bridge
   is and isn't allowed to do).
2. Confirm `MONGODB_DB_NAME` on whatever deployment you're pointed at (see above).
3. Dry-run before every apply. No exceptions, no "this one's obviously fine."
