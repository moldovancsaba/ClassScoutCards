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

## A non-NYC borough/region value may be correct, not a bug — check `city` first (found 2026-08-07)

`providers.borough` is typed as a general `Region`, not a fixed NYC-only enum — the main app supports at
least one non-NYC city tenant (`city: "la"`, absent = the "nyc" default) with its own region/neighborhood
vocabulary entirely distinct from NYC boroughs (LA uses `"Central LA"`/`"Harbor"`/etc., not
`"Manhattan"`/`"Brooklyn"`). A record with a borough value that looks wrong for NYC (e.g. `"Central LA"`)
is not automatically a data-quality bug — it may be a perfectly legitimate LA-tenant record. **Always
check the record's `city` field before treating an unfamiliar borough/region value as a defect.** If
`city` confirms a non-NYC tenant, judge the region/neighborhood against THAT city's own geography (in
`classscout`, `src/data/laLocations.ts` for LA) rather than NYC boroughs — a real case
(`prov-angels-gate-cultural-center-san-pedro`) had a legitimate LA-tenant record with the wrong LA region
(`"Central LA"` instead of the correct `"Harbor"`, per the main app's own LA geo data) — a real defect,
but a narrower one than "this shouldn't be on this NYC platform at all."

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
- `meetup-bedford-stuyvesant-early-childhood-development-center` — a real federally-funded Head Start
  program (six centers, free toddler/3K/Pre-K enrollment for ages 2–5), the same sub-pattern as the
  daycare case — an early-childhood EDUCATION provider, not a meetup group.
- `meetup-bedstuy-community-partnership` — a DIFFERENT sub-pattern: a broad multi-service community
  resource hub (housing assistance, food distribution, medical referrals, youth employment, senior
  services), where the one workshop that sounds group-like ("Mommy & Me, Daddy & Me Game Night") has no
  confirmed recurring schedule, and the org's only confirmed cadence is a *monthly* admin meeting, not
  the stored `"Weekly"`.

**Recognizing it**: the description reads like a business's own marketing copy (services, tuition,
programs "for your children"), like editorial/media copy (articles, an events calendar), or like a
resource/referral hub's mission statement (connecting families to services across many unrelated
domains) — not like an invitation to a recurring gathering — with no cadence/schedule that's actually
about people meeting up, even though the record has a `cadence` value filled in. Check what the source
page is actually FOR, not just whether its facts are individually plausible.

**Handling it**: quarantine (Decision Matrix C) — there is no combination of `meetupGroups` fields that
makes a paid business, a media outlet, or a resource hub accurately describable as a meetup group, and
this bridge cannot move a record to a different collection (no create capability, by design). **Say so
explicitly in the recommendation, AND name the specific correct destination** — not every misfiled record
belongs in `providers`: an education/childcare business (daycare, Head Start center) belongs in
`providers`; a broad referral/resource hub belongs in the family-services domain (`serviceLeads`), which
is a materially different pipeline with its own review track (see Cross-collection lookups below) — get
this specific, don't default every wrong-entity-kind recommendation to "should be a provider." Quarantining
removes a bad listing, but the real entity also disappears from the catalog entirely unless someone
re-ingests it under the correct entity kind — the quarantine write alone does not fix that; flag it as
follow-up work, don't let it read as "handled."

**Is this a live discovery bug, or legacy data? Check before recommending a pipeline fix.** A third case
(`meetup-bedford-stuyvesant-early-childhood-development-center`, a real Head Start program) confirmed
this specific sub-pattern — an early-childhood/education *center* filed as a `meetupGroup` — is legacy
data, not something the current pipeline would still produce: `inferListingKind`'s actual regex signals
(`discoveryWorker.ts`) require specific phrases like "parent... group/meetup/support/circle" or
"family meet-up" — plain words like "family," "community," or "center" alone never match. None of the
three cases' real text (daycare marketing copy, Head Start program copy) would trip these signals today,
and all three share zero `updatedAt` ever set — consistent with pre-dating current classification, not a
fresh miscategorization happening right now. **Don't assume "found 3 in a row" means "live pipeline bug"
— check the actual matching logic against the actual bad text first.** When it's legacy (as here), the
right recommendation is a one-time bulk audit/backfill (scan `meetupGroups` for enrollment/tuition/
business-signal keywords — "enroll," "tuition," "daycare," "Head Start," "3K," "license") to find the
rest of this batch, not a pipeline code change — the code isn't what's wrong. Save "propose a discovery
code fix" for a pattern you can show the CURRENT logic would still produce, the way the aggregator/
`scoreAuthority` case was.

## A fabricated business identity: the record's name matches nothing real (found 2026-08-07)

A distinct pattern from both wrong-entity-kind and aggregator sources — the record's every field
(address, phone, website) traces conclusively to ONE real, verifiable entity, but that entity's real
name is different from what's stored, and the stored name implies an activity the real entity does not
itself offer. Real case: `prov-big-apple-swim-school-brooklyn`. Address (2937 86th Street), phone
((718) 333-0300), and website (bigappleacademy.com) all corroborate (Yelp, PropertyShark, the site
itself) to **Big Apple Academy**, a full-time private PreK–Grade 8 school — which explicitly has no
in-house swim program; swimming is provided through an unrelated external partner, Dolphin Swimming
School, listed under the school's own "Our Partners" page. The stored name conflates the school's real
details with an activity type it doesn't offer.

**Recognizing it**: don't stop verifying once address/phone/website all corroborate each other — also
confirm the corroborated entity's real name and real offerings actually match what the record's `name`
and `activityTypes` claim. A record can have 100% internally-consistent, real contact details and still
have a fabricated identity if those details belong to a *different* real business than the one implied by
its own name.

**Handling it**: quarantine (Decision Matrix C) — this bridge cannot rename a record to the entity its
own facts actually belong to, and even if it could, a full-time private day school is the wrong entity
kind for this platform's supplemental-activity categories regardless of the name. Recommend a fresh
discovery pass under the real offering entity's real name (here, Dolphin Swimming School) if a card for
that activity is wanted — don't salvage-by-renaming.

## Repeated site-extraction defects across sibling records under one source domain (found 2026-08-07)

When several records share one real underlying source site (e.g. multiple `prov-aviator-sports-*`
records, all really describing programs hosted at the same Floyd Bennett Field facility), a scrape/
extraction defect found on one record is likely to recur on its siblings, not be a one-off: a full
nav-menu/news-snippet scrape dump and un-decoded HTML entities (`&amp;`, `&#038;`) were found
independently on more than one Aviator Sports record in the same review run. When you find this kind of
defect, check sibling records sharing the same source domain before moving on — the underlying extraction
step is what's broken, and it will keep producing the same class of defect for every record it touches
until fixed upstream. Note it as a recommendation the same way the aggregator/`scoreAuthority` gap is
flagged, rather than treating each sibling as an independent, unrelated fix.

## Address must be map-accessible and geo-confirmed, not just a nicer street line (owner directive, 2026-08-07)

Fixing an incomplete address (e.g. `"900 Fulton St"` with no borough/zip) is not just about making the
text read better — it must become something a maps service can actually place with confidence. When
correcting or filling in a `providers.address`:

1. **Verify the full address** via source corroboration: street number + name, borough, city, state,
   **and zip code** — a bare street name with no zip/borough is not "done," even if it happens to be
   technically findable.
2. **Set structured fields alongside the address string**, using the real schema (`src/types/provider.ts`
   in the main app, exposed read/write through this bridge as of this version): `addressComponents`
   (`streetNumber`, `route`, `locality`, `administrativeArea`, `postalCode`, `country`),
   `addressNormalized` (the canonical single-line form), and `addressConfidence`
   (`"rooftop"`/`"range"`/`"neighborhood"`/`"region"`/`"unknown"` — be honest about which one actually
   applies; a verified street address with a confirmed zip is `"rooftop"`, a confirmed neighborhood with
   no verified street number is `"neighborhood"`, never claim `"rooftop"` you didn't actually verify).
3. **Set `geo` (`lat`, `lng`) with `source: "approximate"`, and only `"approximate"`** — this bridge
   enforces that at write time now (see `cardBridgeWrite.ts`). This bridge has no real geocoder; it is
   not honest to claim `"google"`/`"nominatim"`/`"places"`/`"civic"` quality for a value derived from
   research and lookup, not an actual geocoding call. Pick `lat`/`lng` for the verified address/
   neighborhood centroid — good enough for map placement, not a false claim of rooftop-geocoder precision.
4. **Never downgrade existing better geo.** If a record already has `geo.precision` of `"exact"` or
   `"interpolated"` (real geocoder output), this bridge now rejects any write that would replace it with
   an `"approximate"` value — enforced at write time, both dry-run and apply. This bridge can only fill
   gaps where no real geocoding exists, never overwrite it with a guess.
5. **Confirm neighbourhood, borough, and city are all mutually consistent** — not just individually
   plausible. Re-verify all three together against the confirmed address, the same way the multi-city-
   tenant rule above requires checking `city` before judging a borough/region value.

## Cap `activityTypes` at 3, and name the real headline activity via `primaryActivityType` (owner directive, 2026-08-07)

Cards must show at most the top 3 activities a source itself lists, in the order the source lists them —
never a longer list, and never a re-sorted "most important first" guess. This bridge now enforces the
3-item cap at write time (`cardBridgeWrite.ts` rejects more than 3). If a source lists more than 3 (e.g.
"Soccer, Swimming, Running, Art, Music"), take the source's own first 3 and drop the rest — **but record
what was cut in the write's `reason` text**, so it isn't silently lost from the review trail, even though
it must never be shown or used live.

When one of the (at most 3) activities is clearly the headline/main one — the source's own primary
offering, not just alphabetically or positionally first — set `primaryActivityType` (plus
`primaryActivityTypeConfidence` when you have a real basis for a number) to that value, using the exact
string as it appears in `activityTypes`. This is the main app's real, already-consumed mechanism
(`classifyPrimaryActivityType` at ingestion; consumed by the category-banner picker and the "Activities"
display) for indicating a headline activity — **not** a reason to truncate `activityTypes` further. Don't
invent a headline activity that isn't clearly supported by the source; leave `primaryActivityType` unset
when the source doesn't make one activity obviously primary over the others.

## The never-downgrade geo guard can trap a bad pin derived from bad address text (found 2026-08-07)

Real case: `prov-brooklyn-ayso`. The stored `address` was a wrong neighborhood restatement
(`"Downtown Brooklyn, Brooklyn, NYC"`) that didn't even match where the league actually plays (its own
site: games are at Prospect Park's Parade Ground, nowhere near Downtown Brooklyn). The stored `geo`
(`precision: "interpolated"`, `source: "nominatim"`) sits at coordinates consistent with having been
geocoded FROM that same wrong address text — i.e. the "better-quality" geo is itself wrong, just
confidently wrong. After correcting the address text, this bridge's own never-downgrade guard (see the
address/geo standard above) correctly refuses to let a new `"approximate"` guess overwrite the existing
`"interpolated"` value — but "existing precision tier is high" and "existing value is actually correct"
are NOT the same thing, and this guard can only ever check the former.

**Handling it**: don't fight the guard — it's doing its job (this bridge genuinely has no way to produce
a trustworthy replacement pin). Fix the address text (which is independently verifiable and worth fixing
on its own), leave `geo` untouched, and say so explicitly in the write's `reason`: name the likely-wrong
existing geo, explain why it's suspect (it was almost certainly derived from the bad address text that's
being corrected), and recommend a real re-geocode of the corrected address as external follow-up work —
don't let "the guard blocked the geo write" read as "geo is now fine."

## A shared placeholder address can produce an identical, wrong geo pin across unrelated records (found 2026-08-07)

FOUR records so far, across two review runs, have shared the exact literal placeholder address text
`"Downtown Brooklyn, Brooklyn, NYC"` AND the exact same geocoded `geo` coordinates
(`lat: 40.6915721, lng: -73.9867644`) despite being unrelated businesses: `prov-brooklyn-ayso`,
`prov-brooklyn-ballet-school`, `prov-brooklyn-elite-volleyball`, `prov-brooklyn-pro-volleyball-academy`.
For the ballet school the coincidence was harmless (it really is in Downtown Brooklyn); for the AYSO
league it was actively wrong (the league plays at Prospect Park's Parade Ground, nowhere near that pin).
This is strong evidence the discovery pipeline has a fallback that geocodes a generic borough-level
placeholder string when no real address was extracted, producing geo that LOOKS like real geocoder output
(`precision: "interpolated"`, `source: "nominatim"`) but is really just "here's roughly where this
borough is" — indistinguishable from trustworthy geo without cross-checking, and (per the section above)
this bridge's own never-downgrade guard will defend a wrong placeholder-derived pin just as readily as a
real one. At four-for-four, treat ANY record still carrying this exact literal address string as
carrying this exact suspect pin too — don't re-derive suspicion from scratch each time.

**Handling it**: when you find one record with this pattern (a placeholder-style address string paired
with `precision: "interpolated"`/`"exact"`), check whether the address text is truly the record's own
data or a generic fallback — and flag it explicitly if two or more records so far have shared the exact
same coordinates, since that's a much stronger signal than "this one pin looks a little off." Recommend
the core team query for providers sharing this exact `geo` value (or the literal placeholder address
string) as a batch, not record-by-record — this bridge has no bulk query capability to do that detection
itself.

## A spurious "Music" activityType recurring on unrelated sports records (found 2026-08-07)

A literal `"Music"` entry appeared in `activityTypes` on FIVE unrelated, otherwise-normal records this
session: `prov-brooklyn-ayso` (a soccer league), `prov-brooklyn-pro-volleyball-academy` (a volleyball
academy), `prov-brooklyn-skyhawks-football` (a football/cheerleading program), `prov-brooklyn-sports-club-
swim-academy` (a swim school), and `prov-camp-half-blood-brooklyn` (a mythology-themed adventure camp) —
none has any music offering anywhere in its real source material. Unlike the `"no category"` placeholder (an
obviously-fake string), `"Music"` is a real, valid `activityType` value elsewhere, so it doesn't stand out
as broken the way a placeholder does — it just quietly doesn't belong. Three unrelated instances is enough
to suspect a systemic classification issue (e.g. a keyword/embedding match firing on unrelated source
text), not independent one-off scrape errors. **When reviewing
`activityTypes`, check every entry against what the source ACTUALLY describes, not just for obviously-fake
placeholder strings** — a real-looking value can be just as wrong as a fake one. Flag a repeat of this
specific pattern (`"Music"` on a non-music record) explicitly as a recurrence, not a fresh unrelated find.

## A record's own `name` field can itself be an extraction defect (found 2026-08-07)

Real case: `prov-camp`. The record's `name` was literally `"Camp"` — while its own `shortDescription`
already said "Camp Orot is a Jewish Day Camp...". The extraction pipeline had correctly captured the real
name inside the description text but failed to extract it into the `name` field itself, likely truncating
on a generic word. This is a different failure mode from the wrong-entity-kind or fabricated-identity
patterns above — the record IS the right real entity, just under a mangled name.

**Recognizing it**: check whether `name` actually matches the entity described in the record's own
`shortDescription`/`longDescription`/source text — don't assume `name` is trustworthy just because it's
a short, plausible-looking string ("Camp" reads as a reasonable generic label, not obviously broken, the
same way `activityTypes: ["no category"]` or a placeholder address stand out).

**Handling it**: `providers.name` was NOT writable through this bridge until this exact case surfaced it
as a real gap — widened alongside this finding (`serviceLeads.name` was already writable; this extends
the same capability to `providers`). Correct the name from source-confirmed real identity, the same
evidentiary bar as any other field — never invent a name, and never "fix" a name by picking one bundled
entity out of an aggregator page (that's the aggregator pattern above, not this one).

## Extraction-failure text can leak directly into a stored content field (found 2026-08-07)

Real case: `prov-camp-half-blood-brooklyn`. `longDescription` contained, verbatim, the LLM extraction
prompt's own instruction text: `"Extract age or grade evidence from the official program page.."`. This
is a different, more severe failure than the nav-menu-scrape-dump pattern documented above — that pattern
is real (if messy) page content; this is not page content at all, it's the PROMPT that was supposed to
produce a real answer, stored as if it were the answer. The same record's `shortDescription` showed a
related but distinct failure: a raw Apache directory-listing page (`"Index of / Name Last modified
Size..."`), meaning the scraper fetched the wrong URL entirely (likely a broken/misconfigured path)
rather than the camp's real page.

**Recognizing it**: watch for description text that reads like a template/meta-instruction rather than
prose about the entity ("Extract X from Y", "Summarize the...", any second-person instruction voice) —
this is qualitatively different from messy-but-real scraped chrome and should be treated as a full
content-fields failure, not a copy-editing job.

**Handling it**: rewrite from real, independently-verified source material exactly as any other bad
description would be fixed — the underlying entity is usually still real and findable even when the
stored extraction completely failed. Recommend the core team add a detection signature for this specific
failure class (e.g. flag any stored description containing extraction-prompt phrasing like "extract" +
"official program page", or containing directory-listing markers like "Index of /") since it indicates
the pipeline should retry against a different URL/extraction path, not just that the copy needs editing.

## Duplicate provider records for the same real organization under different IDs (found 2026-08-07)

Real case: `prov-congregation-beth-elohim-camps` and `prov-cbe-kids-congregation-beth-elohim`. Same
website domain (`cbebk.org`), same phone, same real camp — but two separate provider records with
different generated IDs, apparently created because the discovery pipeline scraped the org's homepage
and its `/cbe-kids-camp/` subpage as if they were two different businesses. One record carried a
much noisier, broader nav-menu scrape (the whole congregation's homepage: worship, K-12 education, adult
programs) while the other was already correctly scoped to the camp itself.

**Recognizing it**: check `website`/`email`/`phone` against records you've already reviewed this session
(or spot-check via search) — a shared domain + matching contact info across two differently-named,
differently-ID'd provider records is the signal, not matching names (the two IDs here don't even look
alike: `congregation-beth-elohim-camps` vs `cbe-kids-congregation-beth-elohim`).

**Handling it**: this bridge cannot merge or delete records, so don't try to enrich both in parallel —
that just produces two diverging descriptions of one real camp. Quarantine the noisier/less-specific
duplicate, keep the better-scoped one as canonical (enrich that one, if not already done), and recommend
the core team dedupe the pair and check whether the discovery pipeline is generally capable of treating
two pages on the same domain as two separate businesses — this may not be a one-off.

## Writing voice: specific and warm, never generic — this is a recommendation, not a listing (owner directive, 2026-08-07)

"Enough facts, correctly placed" is not the finish line for a description — it also has to read like a
real recommendation from someone who knows the place, not an institutional summary. Two failures are
both real, both already found this session, and both matter equally:

- **Data-quality failure**: wrong facts, URL leaks, scraped chrome, wrong entity kind. Everything above
  this section is about catching these.
- **Voice failure**: facts are all correct and clean, but the copy is generic, impersonal, or
  meta-referential ("the page says...") — see the Verification Checklist item above. This is just as
  much a defect as a wrong fact, even though `validateCopyQuality` can't catch it mechanically.

**What "good" looks like**: specific over generic (name the actual address, the actual day/time, the
actual topics — never "various activities" when the source says exactly what they are), warm over
clinical (write like a knowledgeable local telling a parent about a place worth checking out, not like a
directory entry), and a real point of view where the source supports one (why this might be worth a
family's time — the age-appropriate structure, the free cost, the specific community it serves) — while
staying 100% source-backed. **Never invent a recommendation-worthy detail that isn't in the source** —
"why it's worth going" has to come from real facts already gathered (free, specific curriculum, a
distinctive community focus), not from generic enthusiasm ("a great place for families!") that could be
copy-pasted onto any card. If the source doesn't give you anything genuinely distinctive to say, say the
plain facts well rather than padding with unearned warmth.

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

## Bulk operations (touching many records at once, not one card at a time)

The API has no "not equal to" filter and no way to page through an entire collection by offset/cursor —
`GET /rows` only ever answers "give me the current oldest N (optionally matching this exact-equality
filter)." That shapes how any bulk operation has to be written.

**The stopping-condition trap (real incident, 2026-08-07)**: "fetch oldest N, touch them, repeat until
the fetch returns empty" looks like it terminates, but it never does on real data — touching a record
only refreshes its `updatedAt`, it never removes the record from matching the query again. A first
attempt at bulk-deprioritizing every non-Classes/Camps record ran this exact pattern against `meetupGroups`
(~70 real documents) and looped indefinitely, re-touching the same ~70 records roughly 70+ times each
(over 5,100 total writes) before being caught and killed manually. No content was corrupted — `touch`
only ever stamps `updatedAt`/`lastReviewedAt`/`lastReviewedBy` — but it wasted thousands of writes and
audit-log entries on records that only needed touching once.

**The fix, required in any bulk-touch script**: track every ID touched *this run* in a Set, and stop a
given phase the moment a fetched batch contains zero IDs not already in that set — that's the real
signal a full cycle has completed and you're seeing already-touched records again, not fresh ones.
Layer a hard numeric safety cap on top as a backstop regardless of how careful the logic looks. Verify
the fix on a small/cheap phase first (a small collection, or a narrow filter) before trusting it against
a large one, and watch the first real output live rather than only checking after the fact.

**Filter by the exact category values you want to touch, not by "the current global oldest," whenever
you can** — `filter={"category":"Birthday Parties"}` naturally exhausts (every real match will eventually
have been touched, and each fetch reveals genuinely new candidates) far more predictably than an
unfiltered "oldest N" sweep, which mixes matching and non-matching records together with no way to skip
past one without touching it.

**Payloads with an apostrophe**: passing JSON through a shell one-liner (`curl -d '{...}'`) makes an
apostrophe inside a description a real hazard — it's easy to silently drop it while escaping around the
outer shell quotes ("Prospect Parks" instead of "Prospect Park's" happened live during this session,
caught only because the dry-run output was actually read before applying). Write the JSON body to a file
and use `curl --data @file.json` instead — no shell-quoting interaction with the payload's own content at
all. Always validate the file with `JSON.parse` (or equivalent) and eyeball the exact field value before
sending, dry-run or not.

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
- v8 (2026-08-07, owner directive): added two things after a third wrong-entity-kind case (a real Head
  Start program). First, a live-bug-vs-legacy-data check: confirmed `inferListingKind`'s actual regex
  wouldn't misclassify any of the three cases' real text, and all three share zero `updatedAt` ever set —
  this is legacy data, and the recommendation should be a bulk audit, not a discovery pipeline fix; don't
  assume "found N in a row" means "live bug" without checking the current logic against the actual text.
  Second, a "Writing voice" section — generic/impersonal copy is a defect exactly as real as a wrong
  fact, even when `validateCopyQuality` can't catch it; descriptions should read like a specific, warm
  recommendation from someone who knows the place, never invented enthusiasm.
- v9 (2026-08-07): a fourth wrong-entity-kind case (a broad community resource hub) surfaced a distinct
  sub-pattern from the daycare/Head-Start cases — not every misfiled `meetupGroup` belongs in `providers`
  when re-ingested; a referral/resource hub belongs in the family-services domain instead. The
  recommendation for this pattern must now name the specific correct destination collection, not default
  to "should be a provider."
- v10 (2026-08-07): added "Bulk operations" after a real incident — a bulk-deprioritization script's
  "fetch oldest N, touch, repeat until empty" stopping condition never actually terminates on real data,
  and looped ~5,100 times against a ~70-document collection before being caught. Documents the required
  fix (track touched-this-run IDs, stop on a batch with nothing fresh, add a hard safety cap) and a
  separate lesson from the same session: pass write payloads with apostrophes via a JSON file
  (`curl --data @file.json`), not an inline shell string, after one silently lost an apostrophe mid-fix.
- v11 (2026-08-07): widened `providers.address` to writable — the SOP's own checklist requires a real
  street address before publish, but this bridge had no way to correct one until a real card's stored
  address turned out to be a completely different, wrong Brooklyn neighborhood.
- v12 (2026-08-07): widened `providers.neighborhood`/`.phone`/`.activityTypes`/`.borough` to writable and
  exposed `.city` as read-only, across a run of five consecutive cards. Each widening was driven by a
  real defect found live: an internally-contradictory address/neighborhood pair, a literal placeholder
  string (`"no category"`) polluting `activityTypes`, a findable-but-empty phone number, and a
  non-NYC-tenant record whose region was wrong within ITS OWN city's geography. Added the "non-NYC
  borough may be correct" rule after the last case, so a future pass checks `city` before treating an
  unfamiliar region value as a bug.
- v13 (2026-08-07, owner directive): exposed `providers.geo`/`.addressComponents`/`.addressNormalized`/
  `.addressConfidence`/`.primaryActivityType`/`.primaryActivityTypeConfidence` for read/write (all real
  main-app schema fields, previously unreachable through this bridge), and added three write-time
  guards: `activityTypes` capped at 3 entries, `geo.source` restricted to `"approximate"` (the only
  honest value — this bridge has no real geocoder), and a never-downgrade check rejecting any `geo`
  write that would replace an existing `"exact"`/`"interpolated"` pin with a lower-confidence one.
  Documents the resulting standard: a corrected address must be zip-inclusive and geo-confirmed, not
  just a nicer street line, and a headline activity is indicated via `primaryActivityType`, never by
  truncating `activityTypes` further. Also documents two patterns found the same session: a fabricated
  business identity (`prov-big-apple-swim-school-brooklyn` — every fact traces to a real school with no
  swim program, not the swim school implied by the stored name) and repeated site-extraction defects
  recurring across sibling records under one source domain (multiple Aviator Sports records sharing the
  same nav-menu-scrape-dump defect).
- v14 (2026-08-07): added "The never-downgrade geo guard can trap a bad pin derived from bad address
  text" after a real case (`prov-brooklyn-ayso`) where the existing `"interpolated"` geo was itself
  wrong — almost certainly geocoded from the same bad address text being corrected. The v13 guard
  correctly refused to let a new approximate guess overwrite it (it can only check precision tier, not
  correctness), so the fix was to correct the address text, leave geo alone, and name the suspect geo
  plus a re-geocode recommendation explicitly in the write's `reason` — don't let "the guard blocked it"
  read as "handled."
- v15 (2026-08-07): added "A shared placeholder address can produce an identical, wrong geo pin across
  unrelated records" after finding the EXACT same `geo` coordinates on two consecutive, unrelated records
  (`prov-brooklyn-ayso`, `prov-brooklyn-ballet-school`), both of which had previously stored the identical
  literal placeholder address text `"Downtown Brooklyn, Brooklyn, NYC"`. This is stronger evidence than a
  single bad pin — it points at a discovery-pipeline fallback that geocodes a generic borough placeholder
  and produces geo indistinguishable from real geocoder output. Recommend a batch query for shared `geo`
  values as core-team follow-up; this bridge has no bulk-detection capability of its own.
- v16 (2026-08-07): the shared-placeholder-geo pattern reached four-for-four
  (`prov-brooklyn-elite-volleyball`, `prov-brooklyn-pro-volleyball-academy` joined the earlier two) —
  strengthened that section to treat any record still carrying the literal `"Downtown Brooklyn, Brooklyn,
  NYC"` address as carrying the suspect pin too, not something to re-derive each time. Also added "A
  spurious 'Music' activityType recurring on unrelated sports records" after finding it independently on
  a soccer league and a volleyball academy — a real-looking value can be wrong just as often as an
  obvious placeholder; check every `activityTypes` entry against the source, not just for fake strings.
- v17 (2026-08-07): widened `providers.name` to writable (mirroring `serviceLeads.name`, already
  writable) after finding a record literally named `"Camp"` whose own description already named the
  real org, "Camp Orot" — added "A record's own `name` field can itself be an extraction defect" to
  document this as a distinct failure mode from wrong-entity-kind/fabricated-identity: the right real
  entity, just under a mangled name.
- v18 (2026-08-07): the spurious-"Music" pattern reached five instances across unrelated records —
  strengthened that section's example list. Added "Extraction-failure text can leak directly into a
  stored content field" after a record's `longDescription` was found to literally contain the LLM
  extraction prompt's own instruction text (not scraped page content at all), alongside a
  `shortDescription` that was a raw Apache directory listing from the wrong URL — a more severe failure
  than the nav-scrape-dump pattern, worth a distinct detection signature recommendation to the core team.
- v19 (2026-08-07): added "Duplicate provider records for the same real organization under different
  IDs" after finding two provider records (`prov-congregation-beth-elohim-camps` and
  `prov-cbe-kids-congregation-beth-elohim`) sharing a website domain and phone but generated as
  separate entities, apparently from two different pages on the same org's site. This bridge can't
  merge/delete, so the fix is quarantine-the-noisier-duplicate + recommend a core-team dedupe pass, not
  independently enriching both.
