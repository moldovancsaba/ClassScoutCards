# ClassScout Cards

**Read [`CLAUDE.md`](CLAUDE.md) first if you're an agent picking this up cold** — it has the
hard-won gotchas (starting with the database name) that this README won't repeat.

This repo has two unrelated things in it:

1. **The card-bridge** — a read/write HTTPS API in front of the main [`classscout`](
   https://github.com/moldovancsaba/classscout) app's own MongoDB database, deployed to its own
   separate Vercel project. This is the active, current reason this repo is being worked on.
2. **The card generator** — an older feature that generates new activity cards and delivers them to
   the main app. Still present, not currently the focus. See "Card generator" below.

## Why the card-bridge exists

Some environments that need to work with ClassScout's real card data can reach this app's HTTPS
endpoint but cannot open a native MongoDB connection (TCP 27017) directly — a sandboxed session whose
network policy only allows outbound HTTPS, for example. This app already has unrestricted egress to
the same MongoDB Atlas cluster the main `classscout` app uses (that's how a Vercel-hosted Next.js app
normally works), so it acts as a thin bridge: plain HTTPS in, a real MongoDB query/write out.

It is deployed as its **own Vercel project**, separate from the main `classscout` app's project, so
this work can never put the production app at risk — a bad deploy here can't touch that app's
uptime, env vars, or domain.

**The binding operating procedure for actually using the card-bridge to review and improve cards is
[`docs/card-improvement-process.md`](docs/card-improvement-process.md).** This README covers setup and
the API surface; that doc covers the rules for what to check, how to decide, and what's safe to write.
Read it before running a review pass.

## Preliminary requirements — what you need before you can work on cards

1. **A `MONGODB_URI`** for the same Atlas cluster the main `classscout` app uses (ask the project
   owner; this is the same connection string that app already has configured).
2. **`MONGODB_DB_NAME=classscoutcluster`.** Not `classscout`. See `CLAUDE.md` for why this specific
   wrong guess is so easy to make and so costly — get it right the first time.
3. **A `CARD_BRIDGE_API_KEY`** — a dedicated secret for this bridge's endpoints, separate from
   `CLASSSCOUT_INGEST_KEY`. Generate any random string; set the same value in this app's environment
   and in whatever's calling it.
4. **Read `docs/card-improvement-process.md` in full** before running any review/enrichment pass — it
   defines the selection order, the verification checklist, the three decision matrices (pre-publish
   card / already-published record), and the hard boundaries (nothing here can set a content card to
   `PUBLISHED`; a family-service lead can only reach a public status when it has zero blockers;
   quarantining a live provider is one-directional).
5. **Network access to `https://compare.messmass.com`** (or wherever this is currently deployed —
   confirm with `GET /api/status`, which reports the connected database name and collection count) is
   all that's required on the caller's side. No native MongoDB access needed.

## Environment variables

```bash
# Card-bridge (the active part of this repo)
MONGODB_URI=                                  # same Atlas cluster as the main classscout app
MONGODB_DB_NAME=classscoutcluster             # NOT "classscout" — see above
CARD_BRIDGE_API_KEY=                          # dedicated secret, separate from CLASSSCOUT_INGEST_KEY
MONGODB_CONTENT_CARDS_COLLECTION=classscoutContentCards   # rarely needs changing

# Card generator (legacy, unrelated feature — see below)
CLASSSCOUT_BASE_URL=http://localhost:3000
CLASSSCOUT_INGEST_KEY=your-ingest-api-key-here
MONGODB_CARDS_COLLECTION=providers            # this generator's own write target, distinct from the
                                               # content-card pool the bridge reads from above

NODE_ENV=development
PORT=3001
```

## Card-bridge API

All routes require `Authorization: Bearer <CARD_BRIDGE_API_KEY>`.

### `GET /api/card-bridge/rows`

Read-only, oldest-updated-first, across any registered collection.

```
?collection=contentCards|providers|meetupGroups|serviceLeads|servicePlaceFacts|serviceReviewPackets|serviceTasks
  (default: contentCards)
&limit=1..25 (default 5)
&filter={"category":"Camps"}   — simple equality only, fields restricted to that collection's own
                                  read projection; never a generic Mongo query (see
                                  cardBridgeRows.ts's parseSimpleFilter for exactly what's rejected)
```

### `POST /api/card-bridge/update`

The only write path. **Dry-run by default** — nothing is written unless the body explicitly sets
`"dryRun": false`.

```json
{
  "collection": "contentCards | providers | meetupGroups | serviceLeads",
  "id": "...",
  "updates": { "...": "... — only fields in that collection's writable allow-list" },
  "reason": "required, >= 5 chars — a human-auditable justification",
  "source": "required — who/what made this change",
  "dryRun": false,
  "touch": true
}
```

- `touch: true` allows `updates` to be empty — a pure "reviewed this, nothing needed changing" write
  that still stamps `updatedAt`/`lastReviewedAt`/`lastReviewedBy`, so the oldest-first queue actually
  rotates even when nothing was fixed.
- Every collection has its own field allow-list, its own validation (a real `Category` enum check, a
  real `ContentCardState` check that rejects `"PUBLISHED"`, a real `FamilyServiceLeadStatus` check, the
  ported copy-quality gate on description fields, an https-URL sanity check on image fields, and
  one-directional `qualityStatus`/`visibility` values on `providers`) — see
  `src/lib/delivery/cardBridgeRegistry.ts` and `cardBridgeWrite.ts` for the exact current rules, and
  `docs/card-improvement-process.md` for when each outcome is the right call.
- A `serviceLeads` write never lets the caller set `visibility` or `blockers` directly — both are
  always re-derived from the ported `normalizeFamilyServiceLead`/`validateFamilyServiceLead`, and the
  write cascades into `servicePlaceFacts` (and, when eligible, `serviceReviewPackets`) automatically.
- Every applied (non-dry-run) write is recorded in `cardBridgeAuditLog` with the before-image, `reason`,
  and `source` — the only audit trail; there's no way to write through this API without one.

### `GET /api/card-bridge/oldest-cards` (legacy)

The first version of the read path, `contentCards`-only, kept for backward compatibility. Prefer
`/rows` for anything new.

### `GET /api/card-bridge/diagnose`

Read-only: lists every real database + collection on the same cluster `MONGODB_URI` points at,
ignoring `MONGODB_DB_NAME` entirely. Built to find the `classscoutcluster` vs `classscout` mistake by
evidence instead of guesswork — safe to reuse if a similar "is this even the right database" question
comes up again.

## Card generator (legacy, unrelated to the card-bridge)

Generates new activity cards and delivers them to the main app.

```bash
npm run generate:sample
npm run dev   # starts on port 3001
```

- `POST /api/generate` — generate + deliver a card (`source`, `name`, `category`, `borough`,
  `neighborhood`, `address`, `activityTypes`, `ageRanges`, `description`, `price`, `website`, `phone`,
  `email` in the body). Delivered via `CLASSSCOUT_INGEST_KEY` (ingest API) or, if `MONGODB_URI` is set,
  written directly to the `providers` collection.
- `GET /api/status` — service + connection health (also reports the connected `dbName`, useful for
  confirming `MONGODB_DB_NAME` is correct).
- `GET /api/cards/[id]`, `GET /api/history` — look up / list previously generated cards.
- Quality gate: cards scoring < 50/100 (required fields, address/location, description quality, contact
  info, price) are rejected; 50-70 generate warnings.

## Development

```bash
npm install
npm test              # vitest — all passing
npm run build         # next build — also type-checks
npm run dev           # port 3001
```

No ESLint config exists yet (`next lint` prompts interactively) — pre-existing gap, not fixed as a
side effect of unrelated work; raise it explicitly if it needs fixing.

**Known pre-existing issue**: `next@14.2.3` has critical vulnerabilities per `npm install`'s own
warning. Flagged, not yet upgraded — don't let an unrelated task turn into a silent major-version bump.

## License

MIT
