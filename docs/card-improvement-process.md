# Card Improvement Process (SOP)

Status: v1, first version. This document is itself expected to change as we learn from real runs —
update it in place when a rule proves wrong or a new failure mode is discovered, and note the change
in the changelog at the bottom rather than silently rewriting history.

## Purpose

An ongoing, never-ending loop that revisits ClassScout cards — always the oldest-updated card in the
pool first — learns what the card actually is, researches the real organization/program behind it, and
either improves it or explicitly confirms it needs no improvement. Every pass through the loop is
recorded, even when nothing changed, so the queue rotates and "reviewed" is always distinguishable from
"never looked at."

**"The pool" is not just pre-publish content cards. It is EVERY card, in EVERY state, including
already-`PUBLISHED` providers and meetupGroups (owner directive, 2026-08-06).** Being published is not
an exemption from review — it is a reason to keep re-checking. A card that reached `PUBLISHED` months
ago and was never looked at again is exactly as stale as one still sitting in `DISCOVERED`; the main
app's own maintainer lanes (`maintainerReverify.ts`, `maintainerReclassify.ts`) already re-verify
published providers for this exact reason, and this loop must do the same. Checking published records
is not optional and must not be skipped card-by-card at the operator's discretion — it is a standing
requirement of every pass through the loop.

This is not a one-time cleanup. It runs forever, card after card, as the pool grows and as the rules
below get corrected from real mistakes.

## The loop

1. **Pull the GLOBALLY oldest-updated record**, across ALL THREE card-bearing collections — not just
   `contentCards`. Fetch the single oldest row from `contentCards`, `providers`, and `meetupGroups`
   independently (`GET /api/card-bridge/rows?collection=X&limit=1` for each, no other filter), then
   compare their three `updatedAt` values and take the smallest. Do not process a whole collection to
   exhaustion before checking the others — the three queues interleave by age, and skipping straight to
   "whichever collection I was already in" is exactly the kind of implicit exemption this rule exists to
   close. Selection within each collection is always `updatedAt asc, <idField> asc` — the same canonical
   ordering every lane in the main app uses. Never hand-pick a card out of order.
   **The cross-collection comparison uses the exact same rule, never a coin flip**: a record with no
   `updatedAt` at all (never touched — common on legacy seed data) sorts as older than any record that
   has one. When two or more candidates across different collections tie on `updatedAt` (including
   multiple candidates all lacking it entirely), break the tie by `idField` ascending, string-sorted —
   the identical mechanism already used for the within-collection tie-break, just applied globally.
   **Selection must be 100% deterministic and reproducible from the same data — never randomized, even
   when "ambiguous."** A tie is not an invitation to pick arbitrarily; it just means the tie-break rule
   above decides it instead of `updatedAt` alone (owner directive, 2026-08-07, after a random pick was
   used here in error).
2. **Learn** the card's current stored state: every field the bridge's read projection exposes,
   including `enrichmentSummary` (what the pipeline already extracted) and, for family-service cards,
   the linked `serviceLeads`/`servicePlaceFacts`/`serviceTasks` records (see "Cross-collection lookups"
   below) — the content card is frequently NOT the only record for the same real-world entity.
3. **Research** the real organization/program. At minimum, fetch the record's own source fresh —
   `sourceUrl` for `contentCards`/`serviceLeads`, **`website` for `meetupGroups`** (it has no `sourceUrl`
   field at all; `website` is the closest real analog, added to the bridge's read projection 2026-08-07
   after a review had to guess the org from garbage scraped text instead) — never rely solely on
   `enrichmentSummary.sourceTextSample`, which may be stale or truncated. Prefer corroborating with a
   second source (web search) when the first source is thin, ambiguous, or the record's stored facts
   look wrong. **Never fabricate a fact that isn't source-backed.** If research can't confirm something,
   that is itself the finding — record it as a gap, don't guess.
4. **Decide: enrich, fix, or leave as-is.** Compare researched facts against the four in-scope quality
   properties (category/activity classification, age/schedule/location, image presence & integrity,
   public copy quality) and the card's own state-machine correctness (Decision Matrix A below). A
   correction is only made when research provides real evidence for it — "the existing value might be
   wrong" is not enough; "the source page now clearly says X" is.
5. **Decide: block / draft / publish / leave.** Maps to the card's own `state` field (Decision Matrix
   B). **This bridge can never set `state="PUBLISHED"`** — that requires the main app's full publish
   gate (dedupe, schema validation, image pipeline, safe-publish flags), which this bridge does not
   replicate and must not bypass. The strongest outcome available here is `REVIEW_READY` — handing off
   to whatever process owns real publication.
6. **Touch, always.** Every pass through the loop stamps `updatedAt` + `lastReviewedAt` +
   `lastReviewedBy`, even when step 4/5 concluded "leave as-is." Use `touch: true` on the write request
   when there is no content change to make — never skip the write just because nothing needed fixing.
   Skipping this step breaks the queue: the same "already fine" card would keep coming up first forever.
7. **Persist.** `POST /api/card-bridge/update`, `dryRun: false` to actually commit. Every applied write
   (touch or content change) is recorded in `cardBridgeAuditLog` with the pre-image, `reason`, and
   `source` — this is the only audit trail; there is no way to write through this bridge without one.
8. **Go to 1.**

## Verification checklist (step 2/4 — run this explicitly, every time)

A real miss during the first end-to-end test (2026-08-06): a card was reviewed and called "no defect
found" without checking it against a complete, explicit list of what's actually required — a garbage
"candidate image" (a UI icon, not a photo) sat in plain sight in `enrichmentSummary.extractedFacts` and
was missed simply because nobody looked at that specific field with a checklist in hand. **"Learn the
content" (step 2) is not complete until every item below has been checked against real data, not
skimmed.**

The four target properties (category, age/schedule/location, image, copy) do NOT apply uniformly —
`entityKindHint` determines which checklist branch applies. A restaurant lead has no age range or
class schedule; applying the provider checklist to it is itself a mistake.

### A. Always (every content card, any entityKindHint) — rule doc "Content Card Identity"
- [ ] `contentCardId`, `normalizedTitle`, `sourceUrl`, `sourceHost` all present and non-empty
- [ ] `sourceAuthorityGrade` is not silently "unknown" without a stated reason
- [ ] `fingerprint` is present (dedupe depends on it — a card missing this can't be deduped against)
- [ ] `latestRunId` is present (provenance — which run produced this card)
- [ ] `enrichmentSummary` exists and its `extractedFacts` are individually sane — **read every fact
      value, don't just check the array is non-empty.** A "candidate image" that's a nav icon, a
      "category" that's a cuisine, a phone number that's obviously malformed — these pass an
      emptiness check and still be wrong.
- [ ] `visitorVisibility` / `operationalVisibility` match the card's real state (e.g. a card that's
      actually parked shouldn't read `"active"`)

### B. entityKindHint = "provider" or "meetupGroup" (heading toward publish)
- [ ] Category/activity classification matches the real program type (not a keyword echo)
- [ ] Age range and schedule are source-backed, not invented, not silently defaulted
- [ ] A real image exists (not a category banner masquerading as one, not a UI asset) once published
- [ ] Public copy passes `validateCopyQuality` (URL-free, chrome-free, no placeholder, no raw entities,
      >= 20 real chars) once it reaches a `shortDescription`/`longDescription` field
- [ ] Public copy is written in DIRECT voice, describing the entity itself — not meta-referential
      framing that describes a SOURCE PAGE ("the official event page says...", "the page describes...",
      "X publishes Y as a Z") instead of the group/provider directly. `validateCopyQuality` doesn't
      catch this (it's not a URL/chrome/entity defect — the prose is otherwise clean), so it has to be
      caught by reading the copy, not just running the validator. Real miss, 2026-08-07: a first pass
      fixed a URL-leak defect but left "AFFCNY publishes NYC Caregiver Connection LIVE! Manhattan as a
      free... The official event page says the group is generally scheduled..." in place — technically
      valid copy, but generic and impersonal, describing a webpage instead of the group. Rewrite so
      every sentence is about the entity ("the group meets on...", "monthly discussions cover...") —
      keep every fact exactly as-is, change only the framing.
- [ ] Address is a real, number-bearing street address (main app rule: "no address → no publish")

### C. entityKindHint = "familyService" (its OWN track — never the provider checklist)
Cross-reference the linked `serviceLeads` row (match by `sourceUrl`) — the content card is not the
authoritative record.
- [ ] `serviceLeads`: `leadId`, `sourceSystem`, `sourceUrl`, `name`, `duplicateKey` all present
      (`validateFamilyServiceLead`'s own required set)
- [ ] `latitude`/`longitude`, if present, are in valid range (±90 / ±180); if ABSENT, note it — no
      geo means this lead can never appear in `buildNearActivityLinksForProviders`'s near-activity
      matching, a real (if soft) gap, not a hard blocker
- [ ] `serviceKind` is a plausible venue-type/service description — flag (don't silently "fix") if
      it's actually just the cuisine (see the serviceKind-vocabulary recommendation already filed)
- [ ] `amenities` marked `true` are each traceable to the source's own text/tags, not assumed
- [ ] There is NO age/schedule/image requirement for a family-service lead — the schema (`src/lib/
      familyServices/types.ts`) has no such fields. Do not apply the provider checklist here.
- [ ] `status` progression: is this lead's `status` still `"hidden_ready"` (or another pre-review
      status) long after `updatedAt`? If so, that's a *pipeline* finding (see "Cross-collection
      lookups"), not something to fix on this one lead.

### D. Quantity, not just quality
"Enough data to be useful" is itself a requirement, separate from "the data present is correct":
- [ ] Are there fields the record SHOULD have (per A/B/C above) that are simply absent, vs. fields
      that are present but wrong? Both count as findings — don't stop checking once you've found one.
- [ ] For a family-service lead specifically: is address present at all? It isn't a hard blocker in
      `validateFamilyServiceLead`, but it's real, useful, evidence-backed data if the source has it and
      it was never carried over — worth noting even when it isn't blocking anything.

## Decision Matrix A — enrich / fix / leave (step 4)

| Finding from research | Action |
| --- | --- |
| Stored facts match the source; no defect in any of the 4 properties | Leave as-is; touch only |
| A stored field is wrong or stale, and the fresh source clearly gives the correct value | Enrich: write the corrected, allow-listed field(s), with `reason` citing what changed and why |
| Copy contains a defect (`validateCopyQuality`: URL leak, scraped chrome, placeholder, un-decoded entity, too short) | Fix: rewrite from the source's real content — never patch symptomatically (e.g. never just strip the bad substring and leave a fragment) |
| Source is dead / unreachable / doesn't support the card's facts at all | Do not fabricate a fix. Move to Decision Matrix B (block) |
| A field is genuinely absent from *every* available source (not just this one) | Leave the gap recorded (`incompleteFields` / `blockerCodes`), do not invent a value |
| The card's real record lives partly in another collection (e.g. a `FamilyServiceLead`) and THAT record has the actual defect | Fix it there directly (`serviceLeads` writes are supported, v2) — see "Explicit boundaries" for the derived-field rules (`visibility`/`blockers`) and the cascade to `servicePlaceFacts`/`serviceReviewPackets` |

## Decision Matrix B — block / draft / publish / leave (step 5, `contentCards.state`, PRE-publish cards only)

| Outcome | `state` to set | When |
| --- | --- | --- |
| Leave | unchanged | Card is correctly positioned in its current state; nothing to advance |
| Draft | `REVIEW_READY` | Research confirms the card is accurate and complete enough for a human/next-stage decision — the strongest outcome this bridge can set |
| Block (repairable) | `BLOCKED_REPAIRABLE` + `blockerCodes` | A specific, nameable gap exists that a future pass (or a different process) could plausibly fix |
| Block (terminal) | `BLOCKED_TERMINAL` + `terminalReason` | Source is confirmed dead, the entity doesn't exist, or it's clearly out of scope (e.g. not actually a family/kids activity) |
| Publish | **never** — reject at the API layer | Real publication is the main app's job. Setting `REVIEW_READY` is the correct hand-off; do not try to shortcut it |

## Decision Matrix C — an already-`PUBLISHED` provider/meetupGroup (step 5, live records)

A card reaching this matrix is already public. There is no "state" field to advance — the record IS
the live thing families see right now. The direction of every possible action here is DEFENSIVE:
fixing a real defect, or removing something that shouldn't be visible. There is no action in this
matrix that increases exposure — that direction (approving/publishing something new) belongs to the
main app's own gate, not this loop.

| Outcome | Action | When |
| --- | --- | --- |
| Leave | Touch only | Re-research confirms the live record is still accurate and complete |
| Fix | Write the corrected field(s) (Decision Matrix A applies the same way — same allow-list, same copy-quality gate) | A specific, source-backed correction is available (stale info, a since-fixed schedule, a rotted image link, etc.) |
| Quarantine | `qualityStatus: "quarantined"` + `visibility: "hidden"` | Research finds the record is now genuinely wrong at the root — business closed, source confirms it never should have published, safety/policy concern — and a field-level fix wouldn't be honest |
| Un-quarantine | **not supported by this bridge** | Reversing a quarantine is a bigger call than one automated re-check should make alone — hand off to a human/the main app if a quarantined record needs reinstating |

Quarantining a live record is real and immediate — it stops being shown to families the moment the
write applies. Always dry-run first, and write a `reason` a human could audit later and agree with.

## Aggregator/directory sources are a discovery lead, never a single-entity source (owner directive, 2026-08-07)

A real case (`prov-2026-bronx-summer-camps`): the record's `shortDescription`/`longDescription` were an
incoherent mashup of contact info for FOUR+ separate organizations, no address/website/phone/email of
its own, and `incompleteFields` falsely reported nothing missing. Research traced it to
`bronxsummercamps.com` — a real directory/roundup page listing ~30 distinct camps — that had been
ingested as if the page itself were one provider's own site.

**Recognizing it**: multiple full contact-detail clusters (a distinct phone number + email domain +
website, repeated) appearing in one record's description text is a strong, reliable signal — a single
legitimate business does not list several *other* companies' phone numbers and email domains in its own
copy. Don't wait for the text to look obviously broken; check this whenever a description reads like a
list rather than a description.

**Handling it, in this loop**:
1. **Never treat the aggregator page as this record's own source.** Don't "fix" the record by picking
   one of the bundled organizations and rewriting the description to be about just that one — that's
   not source-backed (the record's own `name` doesn't necessarily match whichever org you'd pick, and
   guessing which one it "should" be is exactly the fabrication Decision Matrix A forbids).
2. **Quarantine the existing bad record** (Decision Matrix C) — it's actively misleading whoever views
   it live, and a field-level fix isn't available for the reason above.
3. **Use the aggregator page as a discovery SOURCE, not a card source.** If it's a real, current
   directory, the individual businesses it lists are legitimate discovery candidates — but creating
   cards from them is the main app's discovery/ingestion pipeline's job, not this bridge's (this bridge
   has no card-creation capability at all, by design). Record the candidate list as part of your
   findings/recommendation for the core team; do not attempt to create records for them yourself.
4. **This is a known, evidenced gap in the main app's discovery pipeline, not just a one-off bad
   record** — `scoreAuthority` (`discoveryWorker.ts`) grades any non-allowlisted custom domain
   `authoritative` by default, with no content-level check for "this page describes many businesses, not
   one"; a markup-structured directory classifier exists (`directoryExtraction.ts`) but is flag-gated off
   by default and wouldn't catch a prose-style roundup post anyway; and the LLM extraction prompt already
   says to skip multi-entity sources but silently falls back to a naive regex extractor (zero multi-entity
   awareness) whenever the LLM call fails. Surface this as a recommendation to the core team every time
   you find a fresh instance — don't just quarantine and move on silently, since the pipeline will keep
   producing the same class of bad record from other directory pages until this is fixed upstream.

## Wrong entity-kind classification: a real business filed as a `meetupGroup` (owner-prompted, 2026-08-07)

A distinct pattern from the aggregator case above — the record IS one real, single, legitimate entity
(not several mashed together), just filed under the wrong collection/type entirely. Two real cases found
in the same review session:
- `meetup-a-child-grows-in-brooklyn` — a parenting blog/media publication with no recurring group at all
  (its own About page: an events calendar plus two *annual* expos, nothing weekly or joinable), stored
  with `cadence: "Weekly"` and `groupType: "Neighborhood Families"`.
- `meetup-baby-steps-daycare-preschool-in-queens-ny` — a real, currently-operating PAID daycare/preschool
  business (three locations, posted tuition, age-tiered enrollment programs), not a free parent meetup —
  there is no recurring social gathering to attend, only enrollment.

**Recognizing it**: the description reads like a business's own marketing copy (services, tuition,
programs "for your children") or like editorial/media copy (articles, an events calendar), not like an
invitation to a recurring gathering — with no cadence/schedule that's actually about people meeting up,
even though the record has a `cadence` value filled in. Check what the source page is actually FOR, not
just whether its facts are individually plausible.

**Handling it**: quarantine (Decision Matrix C) — there is no combination of `meetupGroups` fields that
makes a paid business or a media outlet accurately describable as a meetup group, and this bridge cannot
move a record to a different collection (no create capability, by design). **Say so explicitly in the
recommendation**: quarantining removes a bad listing, but when the underlying entity is a real business
(the daycare case, not the blog case), a real business also disappears from the catalog entirely unless
someone re-ingests it under the correct entity kind (`providers`, in that case) — the quarantine write
alone does not fix that; flag it as follow-up work, don't let it read as "handled."

## Cross-collection lookups (before deciding anything)

Before acting on a `contentCard`, check whether a linked record exists elsewhere — acting on the
content card alone when the real defect is in a linked record wastes the pass and can produce a
misleading audit trail:

- `sourcePool: "family_service"` / `entityKindHint: "familyService"` → look up the matching
  `serviceLeads` row by `sourceUrl` (exact match via `filter`). If one exists, its `status` and
  `serviceKind`/`tags`/`amenities` are the authoritative record for that entity, not the content card's
  own `categoryHint`/`blockerCodes`.
- A stuck/orphaned card with `enrichmentStatus: "valid_source_ready"` and zero blockers that hasn't
  moved in a long time is often a *pipeline* problem (a dead task queue, a routing gap), not a
  *content* problem — don't force a per-card fix for what is actually a systemic gap. Write a
  recommendation (see the project's recommendation convention) instead of papering over it card by card.

## Explicit boundaries (v2 — updated 2026-08-06)

- **No real provider/meetup publication.** Content-card `state` can never be set to `PUBLISHED`
  through this bridge — that path still requires the main app's full gate.
- **`serviceLeads` writes ARE now supported** (v2) — content fields (`address`, `serviceKind`,
  `priceTier`, `neighborhood`, `borough`, `latitude`, `longitude`, `amenities`, `tags`,
  `existingClassScoutCategoryCandidate`, `existingCategoryReason`) and `status`. `visibility` and
  `blockers` can NEVER be set directly — every write re-derives them via the ported
  `normalizeFamilyServiceLead` (`src/lib/familyServices/core.ts` in THIS repo, ported from the main
  app's own logic, not reinvented), so a write can't produce an inconsistent status/visibility pair or
  a stale blockers list. Every applied lead write also cascades into an upserted `servicePlaceFacts`
  row and, when the lead's status is review-eligible, a `serviceReviewPackets` row — mirroring
  `upsertFamilyServicePlaceFacts`/`upsertFamilyServiceReviewPackets` exactly.
  **This means setting `status` to `approved_support_only` or `approved_for_publication` genuinely
  makes the lead publicly visible** (`visibility` flips to `public_support`, which is what
  `publicFamilyServiceFilter`/`publicFamilyServiceFactFilter` read) — the family-service equivalent of
  publishing. Treat that status change with the same care as a real publish decision. A hard safeguard
  blocks it anyway when the lead still carries an unresolved blocker (checked in dry-run too, so it
  surfaces before commit, not after).
- **`servicePlaceFacts` / `serviceReviewPackets` stay NOT directly writable.** They are purely derived
  from a lead in the real architecture; writing them independently would let them drift out of sync.
  Always go through a `serviceLeads` write — the cascade keeps them consistent.
- **No automated "research" step yet.** Step 3 today is performed by whoever/whatever is driving the
  loop (a person, an agent) fetching the source and reasoning about it — there is no wired-in LLM call
  inside the bridge itself. Automating step 3 unattended (e.g. via Vercel Cron) needs a hosted LLM
  API call from the serverless function, which is a real cost + provider decision — proposed, not yet
  built. Until then, this loop runs one iteration at a time, driven explicitly.

## Running the loop today

There is no autopilot yet — each iteration is driven explicitly:

```
# step 1 — three calls, take whichever row has the smallest updatedAt:
GET /api/card-bridge/rows?collection=contentCards&limit=1
GET /api/card-bridge/rows?collection=providers&limit=1
GET /api/card-bridge/rows?collection=meetupGroups&limit=1

# steps 2-5 performed by whoever/whatever is driving this iteration
# (Decision Matrix A/B for a pre-publish contentCards row, Matrix A/C for an already-PUBLISHED
# providers/meetupGroups row)

POST /api/card-bridge/update                                        # steps 6-7
  { "collection": "<whichever collection the winning row came from>", "id": "...", "touch": true,
    "updates": { ... only if something actually changed ... },
    "reason": "...", "source": "...", "dryRun": false }
```

Always dry-run first (`dryRun` defaults to `true` — no flag needed) to review the diff before
committing.

## Changelog

- v1 (2026-08-06): first version, written after tracing the family-services pipeline stall and adding
  `touch` + content-card `state` write support to the bridge specifically to support this loop.
- v2 (2026-08-06): added the Verification Checklist (step 2/4) after the first end-to-end test missed a
  real defect — a garbage "candidate image" fact sitting unchecked in `enrichmentSummary`. Extended
  read projections with the fields the checklist needs (`normalizedTitle`, `fingerprint`,
  `latestRunId`, `sourceAuthorityGrade`, `serviceLeads.latitude/longitude`). Widened `serviceLeads` from
  read-only to fully writable (content fields + `status`), with the ported
  `normalizeFamilyServiceLead`/`validateFamilyServiceLead`/`buildFamilyServicePlaceFact`/
  `buildFamilyServiceReviewPacket` logic driving every write so `visibility`/`blockers` are always
  re-derived and never caller-supplied, and every write cascades into `servicePlaceFacts` +
  (when eligible) `serviceReviewPackets` — this is what makes the loop actually capable of completing
  a family-service card end to end, not just annotating the content card around it.
- v3 (2026-08-06, owner directive): closed an implicit exemption — being `PUBLISHED` was acting as a
  reason to skip review, and it must not be. Step 1 now pulls the globally oldest-updated record across
  `contentCards`, `providers`, AND `meetupGroups`, not just `contentCards`. Added Decision Matrix C for
  an already-published record (leave / fix / quarantine — never an action that increases exposure) and
  widened `providers` writes to support it: `qualityStatus` (only settable to `"quarantined"`) and
  `visibility` (only settable to `"hidden"`) — deliberately one-directional; un-quarantining is not
  supported through this bridge.
- v4 (2026-08-07, owner directive): added the "Aggregator/directory sources" section after a real case
  (`prov-2026-bronx-summer-camps`, a directory page's ~30 distinct camps mashed into one provider) —
  never fix such a record by guessing which bundled organization it "should" be; quarantine it, and
  surface the underlying pipeline gap (`discoveryWorker.ts`'s `scoreAuthority` grades any non-allowlisted
  custom domain `authoritative` by default with no multi-entity content check) as a recommendation rather
  than silently moving on. Also exposed `providers.address`/`website`/`phone`/`email`/`sourceUrls` and
  `meetupGroups.website`/`instagram` as read-only research fields — both collections previously exposed
  no way to find a record's own real source, which is what let this specific defect go undetected.
- v5 (2026-08-07, owner directive): fixed a real error in step 1 — a tie between candidates (most often
  "multiple records with no `updatedAt` at all") was being broken with a random pick instead of a
  deterministic rule. Selection must always be reproducible from the same data. The tie-break is now
  explicit: `idField` ascending, the same mechanism already used within one collection, extended across
  all three.
- v6 (2026-08-07, owner-prompted): added a Verification Checklist item (section B) for meta-referential
  copy — "the page says...", "X publishes Y as..." — that describes a source page instead of the entity
  itself. `validateCopyQuality` doesn't catch this (the prose is otherwise clean); it was found only by
  re-reading a fix that had already resolved a real URL-leak defect on the same record and still left
  this generic framing in place.
- v7 (2026-08-07): added "Wrong entity-kind classification" after two real cases (a parenting blog and a
  paid daycare business, both stored as `meetupGroups` with a fabricated-looking `cadence`) distinct from
  the aggregator pattern — one real entity, wrong collection/type entirely, not several mashed together.
  Quarantine is still the only available action through this bridge, but the recommendation must say
  explicitly when a real business is being lost from the catalog by that quarantine, not just a bad
  listing removed.
