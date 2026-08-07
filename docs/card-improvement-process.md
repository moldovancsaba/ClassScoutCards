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

**Children's safety comes first (owner directive, 2026-08-07): before judging whether a card's fields
are correct, first establish whether it describes a real entity that actually operates a children's
activity/class/camp/program serving NYC families at all.** See `CLAUDE.md`'s own section on this — a
record can look internally tidy (a plausible name, category, borough, schedule) and still not be a
provider of anything to a child; that's a distinct, more fundamental failure than a wrong field, and it
is the check that caught every off-topic-contamination case in this document. When the reality check is
negative or can't be confirmed, default to protecting families (quarantine), not to giving the record
the benefit of the doubt.

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

**A related nuance (found 2026-08-07, card 50 of a mass run)**: an aggregator source can contaminate
just the `activityTypes` tags even when the main description is otherwise fine and accurate.
`prov-sweat-fc`'s real description (a soccer-specific club) was correct, but `activityTypes` carried 10
entries including several sports the club doesn't offer at all (confirmed via search: "not a multi-sport
facility") — traced to one of its `sourceUrls` being a general "spring sports guide" aggregator page
covering many unrelated programs. Check `activityTypes` against the source even when the description
text reads clean.

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

Two real cases, two different sub-patterns — both quarantined, both worth recognizing on sight.

**Sub-pattern A — real facts belong to a different, unrelated real entity.** `prov-big-apple-swim-school-
brooklyn`: address (2937 86th Street), phone ((718) 333-0300), and website (bigappleacademy.com) all
corroborate (Yelp, PropertyShark, the site itself) to **Big Apple Academy**, a full-time private
PreK–Grade 8 school — which explicitly has no in-house swim program; swimming is provided through an
unrelated external partner, Dolphin Swimming School, listed under the school's own "Our Partners" page.
The stored name conflates the school's real details with an activity type it doesn't offer.

**Sub-pattern B — the record's own NAME mashes together two unrelated real organizations.**
`prov-edgies-teen-center-shorefront-y-kids-programs`: "Edgies Teen Center" is a Lower East Side
MANHATTAN program (Manny Cantor Center, 197 East Broadway) — confirmed by every real fact actually
present on the record (website, email, all sourceUrls, the entire description). "Shorefront Y Kids
Programs" is a completely different, unrelated Brooklyn org (Shorefront YM-YWHA, 3300 Coney Island
Avenue) with zero shared facts anywhere. The record's stored borough/address reflected Shorefront Y's
location while every other field was 100% Edgies Teen Center's real content — the location fields and
the content fields describe two different real businesses, not one entity under a wrong name.

**Recognizing it**: don't stop verifying once address/phone/website all corroborate each other — also
confirm the corroborated entity's real name and real offerings actually match what the record's `name`
claims (sub-pattern A), AND cross-check whether the record's OWN location fields (borough/address) match
the org that its OWN content fields (description/website/sourceUrls) are actually about (sub-pattern B).
A record can have 100% internally-consistent-LOOKING data and still be a fabricated identity if the
consistency is between the wrong pairs of fields.

**Handling it**: quarantine (Decision Matrix C) in both sub-patterns — this bridge cannot rename a
record to the entity its own facts belong to (A), nor split a conflated record into two separate real
orgs (B). Recommend fresh discovery passes under each org's own correct name/location as follow-up —
for sub-pattern B, name BOTH real destinations explicitly (the correctly-located one may be largely
reusable from the existing content; the other needs a fully fresh pass since nothing about it survives
in the record at all).

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

## A record's own name can name its location — check it against borough/neighborhood/address (found 2026-08-07)

Recurring pattern across four real cases this session: `prov-chelsea-piers-tennis-brooklyn` (name says
Brooklyn, stored fields said Manhattan/Chelsea), `prov-impact-coaching-network-chess-brooklyn` (name says
Brooklyn, stored fields said Manhattan/Upper East Side, with an address in neither), `prov-goldfish-swim-
school-gowanus` (name says Gowanus, stored neighborhood said the different, non-adjacent Prospect
Heights), `prov-karate-city-uws` (name says UWS, real address is on W 52nd St — Hell's Kitchen, not the
Upper West Side at all).

**Recognizing it**: whenever a record's `name` itself contains a place name (a borough, neighborhood, or
`" - <City>"`/`" <Borough>"` suffix), treat that as a claim to verify — cross-check it against the
stored `borough`/`neighborhood`/`address`, not just against the source's own text. A mismatch here is a
strong, cheap signal of a real defect (wrong assignment, or in the worst case a fabricated/conflated
identity per the section below) — don't skip this check just because the other fields look internally
consistent with each other.

**Handling it**: research the specific location the name claims (which is often the correct one, since
names tend to be assigned closer to the true identity than a downstream borough/neighborhood guess), and
correct borough/neighborhood/address to match — same evidentiary bar as any other field.

## The never-downgrade geo guard's blind spot can hide a wrong-BOROUGH pin, not just an imprecise one (found 2026-08-07)

A more severe variant of the section below: `prov-impact-coaching-network-chess-brooklyn` had a
`precision: "exact"`, `source: "google"` geo pin — real geocoder output, seemingly trustworthy — but it
was geocoded from the record's own wrong Manhattan address while the record's real identity (per its own
name) is a Brooklyn program. The never-downgrade guard correctly refused to let an approximate correction
override "exact" — but "exact" here means "confidently pinned to the wrong borough entirely," not just
imprecise. Handle exactly like the general case below (correct the address text, leave geo alone, name
the suspect pin and recommend a re-geocode) — but recognize that "exact"/"real geocoder source" is NOT
by itself evidence the location is right when the record's own name and address text disagree with where
it was actually pinned.

## Garbled, non-address text can land directly in the address field, not just a neighborhood placeholder (found 2026-08-07)

Real case: `prov-inner-city-arts-downtown-la` had `address: "6-12 summer Institutes takes place"` — a
fragment of an unrelated sentence (likely about "grades 6-12 summer institutes"), not any kind of
location text at all. Distinct from the common neighborhood-restatement placeholder
(`"Downtown Brooklyn, Brooklyn, NYC"`) — this is extraction noise from somewhere else on the page
landing in the wrong field entirely, with zero location information in it.

**Recognizing it**: an address value that doesn't parse as ANY plausible location fragment (no street
name, no neighborhood name, no borough) — reads like a clause from a sentence instead — is this pattern.
Don't assume every bad address is at least a neighborhood-level placeholder; verify what's actually there.

## A source-unreachable blocker can be a stale false positive — re-check before trusting it (found 2026-08-07)

FOUR confirmed instances now: `cc-dfc0ee1004428bb39e92133a` (Kaufman Music Center),
`cc-b85fc529f946a0772f0b9d12` (Marlene Meyerson JCC Manhattan, first `contentCards` record for this org),
`cc-06e77c12a16bea450bfea9f8` (Marlene Meyerson JCC Manhattan again — a second, separate `contentCards`
record for the same real org from a different discovery run), and `cc-84751be06b4b5d1b0fca0356` (Silver
Music) — all `sourceAuthorityGrade: "official"` sources blocked on a stale `source_unreachable`/
`low_source_trust` that no longer reproduces, confirming this is systemic rather than a one-off. The first
case: `cc-dfc0ee1004428bb39e92133a`'s `enrichmentSummary` recorded `"fetch 404"`/`source_unreachable` from
2026-06-13, producing a `low_source_trust` blocker that kept the card parked (not visitor-visible) for
nearly two months despite `state: "PUBLISHED"`. Directly re-fetching the same URL now shows it loads fine
with real content — the org (a well-known NYC institution) never actually had a dead link; the original
check just hit a transient failure and nothing ever re-verified it. All four cases share the same
signature: an `official`-grade source, `enrichmentSummary.sourceAvailability: "official_available"`
already recorded in the card's own history, and a `low_source_trust`/`source_unreachable` blocker that
directly contradicts that — the blocker was very likely set once at a bad moment and never re-evaluated.

**Handling it**: when a card is blocked on `source_unreachable`/`low_source_trust`, don't take the stored
blocker at face value — re-check the URL yourself. If it's actually reachable now, clear the blocker (via
`blockerCodes`, writable on `contentCards`) so the card becomes eligible for a fresh enrichment pass, and
say so explicitly rather than leaving a stale false-positive block in place. This bridge cannot re-run
enrichment itself (no LLM extraction capability, and `contentCards` has no content fields of its own to
fill in directly) — clearing the blocker is necessary but not sufficient; recommend the core team re-queue
the card. **Recommend to the core team**: with four confirmed instances all sharing the exact same
signature (`official`/`official_available` contradicted by a stale trust blocker), this looks like a
specific bug — e.g. a blocker set from one bad fetch attempt that never auto-clears on a later successful
one — worth root-causing rather than relying on this bridge to spot-fix each instance by hand.

## The aggregator-source pattern applies to `contentCards` too — use its own `QUARANTINED` state (found 2026-08-07)

The aggregator/directory-source pattern above was first documented on `providers`, using
`qualityStatus`/`visibility`. It recurs on `contentCards` just as often (a directory listing page scraped
as if it were one business, producing a meaningless title fragment like `"West"` extracted from a
heading such as "Upper WEST Side Camps"). `contentCards` has its own real `state` value for exactly this,
`"QUARANTINED"` (distinct from `providers`/`meetupGroups`' `qualityStatus: "quarantined"` field) — use
`state: "QUARANTINED"` plus `terminalReason` (both writable) to record why, mirroring the same "never
guess which listed business it should be" handling already established for providers.

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

## A second shared-placeholder-geo cluster: "Manhattanville, Manhattan, NYC" (found 2026-08-07)

Distinct from the "Downtown Brooklyn, Brooklyn, NYC" cluster below, a second literal placeholder string
— `"Manhattanville, Manhattan, NYC"` — produced the identical geocoded pin (`lat: 40.8157775,
lng: -73.951554`) on THREE unrelated records this session: `prov-manhattan-soccer-club`,
`prov-metropolitan-oval-academy-manhattan-outreach`, and `prov-mo-motion-basketball`. Same underlying
mechanism, different placeholder text — this is not a one-off fallback string, but a general pattern:
whenever the discovery pipeline can't extract a real address, it falls back to SOME generic
borough+neighborhood-guess string and geocodes that guess. Treat ANY record carrying either exact
placeholder string as carrying a correspondingly suspect pin, and expect more such clusters (different
placeholder text, same failure mode) to turn up in other boroughs.

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

## The same `name`-field defect recurs on `contentCards.title` (found 2026-08-07)

Same pattern as below, different collection: `cc-99ce8d7bebed9ddde20d0788` had `title: "Camps"` — a
generic extraction artifact — while its own `enrichmentSummary.extractedFacts` already named the real
org: "Manhattan Youth Recreation and Resources, Inc." `title` was read-only through this bridge until
this case surfaced it as a gap, mirroring the earlier `providers.name` fix — widened alongside this
finding. Check a contentCard's `title` against its own `extractedFacts`/`sourceTextSample`, not just a
provider's `name`.

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

THREE confirmed instances now: `prov-camp-half-blood-brooklyn`, `prov-kate` (Steve & Kate's Camp), and
`prov-pier-40-baseball-greenwich-village-little-league` (Greenwich Village Little League) — the last had
the identical text in BOTH `shortDescription` and `longDescription`. This is a recurring pipeline
failure, not a one-off. The first case: `longDescription` contained, verbatim, the LLM extraction
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

## Template/webbuilder placeholder values in contact fields, not just description text (found 2026-08-07)

Real case: `prov-champions-martial-arts-brooklyn` had `phone: "555-555-5555"` (the universal fictional
phone number) and `email: "mymail@mailservice.com"` (a generic webbuilder default). Distinct from the
`"no category"` string placeholder (which is obviously a system-internal default) — these look
superficially like real contact info at a glance, because they're formatted like a real phone/email,
just with template/placeholder VALUES. Both fields were also read-only through this bridge until this
case surfaced the gap (see `providers.email`/`providers.name` additions this session).

**Recognizing it**: `555-555-5555` (or similar all-repeated-digit patterns) and generic
`mymail@`/`youremail@`/`example@` style addresses are webbuilder template defaults, not real scraped
contact info — treat them exactly like a placeholder string: verify a real replacement via search, or
clear the field entirely if none is found, never leave the fake value in place.

## Redundant near-duplicate values wasting the activityTypes cap (found 2026-08-07)

Real case: `prov-dna-learning-center-science-camps-brooklyn` had `activityTypes: ["STEM / Science", "STEM",
"Science"]` — three different strings for the same one real concept, filling all 3 cap slots without
adding any real information. Distinct from the recurring off-topic-contamination pattern (Music/Art/etc.
appearing on unrelated records) — this is on-topic but redundant.

**Handling it**: consolidate to the single clean value before applying the 3-item cap — don't let
near-synonyms crowd out room for a second genuinely-distinct real activity the source also supports.

## A mention of linguistic/cultural diversity can be misread as a "Language" activityType (found 2026-08-07)

Real case: `prov-metropolitan-oval-academy-manhattan-outreach` had `activityTypes` including `"Language"`,
but the source text was `"the range of languages reminds us that soccer is the world's sport"` — a
statement about the PLAYERS' linguistic diversity, not any language-instruction offering. A subtler
variant of the generic-activityType-contamination pattern: the extraction wasn't grabbing an unrelated
keyword, it misread a real sentence's actual subject. When a tag like Language/Art/Music shows up, check
what the specific source SENTENCE containing that word is actually describing, not just whether the word
appears somewhere in the text.

## An advocacy/community group can still have a real, listable kids program — check before assuming it's the wrong entity kind (found 2026-08-07)

`prov-mccarren-tennis-association-kids`'s description was almost entirely park-advocacy language (court
lighting, seating, a maintenance-schedule request, a stray anecdote about hawks) — reading, at a glance,
like the wrong-entity-kind pattern (an org whose real purpose isn't running a kids program). But a
targeted check found something the description itself buried: a real, specific, recurring free kids
program (weekly clinics, named days/times), confirmed via an independent local news source. Not every
advocacy-heavy or mission-statement-heavy description means the underlying wrong-entity-kind pattern
applies — verify whether a real, concrete program exists before quarantining just because the visible
text reads as advocacy rather than a program listing.

## A touring/itinerant program has no single correct address — say so honestly, don't pin one venue (found 2026-08-07)

Real case: `prov-mozart-for-munchkins`, a touring interactive concert series performing at many NYC venues
(Lincoln Center, Hudson Yards, NYPL, MoMA, schools) and other cities entirely (Boston, Portland). The
stored address named just ONE of many venues as if it were a home base, and the geo didn't even match
that venue's real coordinates. Distinct from the multi-venue-but-fixed-home cases already documented
(AYSO's Parade Ground, Skyhawks' registered office) — a touring act has no home venue at all, fixed or
otherwise.

**Handling it**: don't pin one incidental venue as the address. Write an honest, non-specific address
(e.g. `"Touring — various NYC venues (X, Y, Z)"`) with `addressConfidence: "unknown"`, and don't attempt
to fix geo — there's no single correct place to point it, so leave whatever's there rather than invent a
replacement anchor.

## Live/operational status (temporary closures, site relocations) shouldn't be written into permanent description text (found 2026-08-07)

Two real cases: `prov-la-brea-tar-pits-museum` (indoor exhibits paused for a multi-year renovation, though
outdoor grounds/programs continue) and `prov-nyc-lions-tackle-football` (displaced from its long-time
practice field by park construction, per a 2025 news report, with no confirmed new site yet). Both are
real, verified facts about the organization's CURRENT operational state — but they're time-sensitive and
likely to go stale by the time a family reads the card.

**Handling it**: don't encode a temporary operational status as if it were a durable program fact.
Describe the organization's real, standing offerings (what it does, who it serves) rather than its
current construction/relocation status. Where a stored fact (like a specific practice address) is
directly contradicted by a live-status change, prefer downgrading its confidence (e.g.
`addressConfidence: "unknown"`) over asserting a now-unconfirmed specific value — but don't rewrite the
whole description around the temporary situation either.

## A record can point to the wrong site when an org runs both a B2B and a B2C brand/domain (found 2026-08-07)

Real case: `prov-musicolor-method`. The record's stored `website`/`sourceUrl` was `musicolormethod.com`
— the org's curriculum-LICENSING site aimed at schools ("bring this into your classroom, no specialist
required"), not something an individual family can enroll a child in. The SAME brand also runs a
consumer-facing site under a different domain (`musicolor.nyc`, formerly "Park Slope Music Lessons")
offering real, family-enrollable in-home/in-studio lessons. The description on file was already about
the B2B product, not the family service — a subtly different failure from the fabricated-identity
pattern (this IS the right organization, just the wrong one of its two audiences/domains).

**Recognizing it**: when a description reads like it's selling TO an institution ("bring this into your
classroom/program," "no specialist required," "licensing," "for schools & districts") rather than to a
family, search for whether the same brand has a separate consumer-facing domain — franchises and
curriculum brands commonly do.

**Handling it**: `website`/`sourceUrls` are read-only through this bridge — flag the mismatch explicitly
as a recommendation (name both domains, and which one families actually need) rather than silently
rewriting the description around content pulled from the wrong site. Fix what IS writable (description,
activityTypes, ages) using the REAL consumer-facing program facts, verified from the correct domain.

## A completely unrelated company can contaminate a record by name coincidence alone (found 2026-08-07)

Two real cases, both severe. `prov-riverside-hawks` (a real Manhattan youth basketball program at The
Riverside Church) had a `sourceUrls` entry pointing at `riverside.com` — an unrelated podcast-recording
SaaS company, pulled in only because it shares the one word "Riverside." That wrong source's own
site-nav chrome ("Start for Free Company About us Blog Careers...") ended up in a `recurringPrograms`
field. `prov-sky-rink-at-chelsea-piers` (the real ice rink at Chelsea Piers) was worse: its ENTIRE
`website`/`sourceUrl` and description were `sky.com` — Sky UK, the British satellite TV/broadband
provider — pulled in by the single word "Sky." The stored description was literally Sky UK's own
TV-streaming copy, priced in British pounds (`"Sky Kids Pack: £8pm extra"`).

**Recognizing it**: this is NOT the fabricated-identity pattern (where facts trace to a different but
still-plausible real business in the same general space) — here the wrong source is from a totally
unrelated industry, often a much bigger/more web-visible company that happens to share one word with the
real, usually smaller, local business's name. A description that reads like software marketing, a
streaming service, or anything obviously outside kids'/family activities on a record that's supposed to
be about a sport or class is the signal — don't assume "the site must have changed" or "this is a
different location of the same brand."

**Handling it**: rewrite entirely from real, independently-verified facts about the ACTUAL organization
— the wrong source contributes nothing salvageable. Recommend the core team review this class of defect:
a discovery step that resolves a business name to a domain via a naive search/match is vulnerable to
exactly this collision, and it's worth checking whether other short, common-word business names
(a recognizable pattern: single common English words, not distinctive multi-word names) have the same
risk.

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

## Splitting a card that represents more than one real thing (added 2026-08-07)

Three recurring patterns from the 100-card mass run turned out to be the same underlying problem: a
single record whose fields can't honestly describe what it actually represents, because it actually
represents more than one real thing. Editing fields on the one existing document can't fix this — it
needs to become N documents. `POST /api/card-bridge/split` (see README.md for the full request shape)
does that: given a `parentId` and a list of N child payloads, it generates N new documents using the
**same ID-generation schemes the main app itself uses** and blocks/quarantines the parent to point at
them.

**When it applies, and what each child needs:**

1. **One real org, several real physical locations** (e.g. Penguin City Swim — Midtown East, John Jay
   College, Riverdale — forced into one `boroughGuess`). Each child needs its own real, independently
   confirmed address/borough/neighborhood and, ideally, its own location-specific page on the org's site
   as `sourceUrl`/`website` — exactly the kind of per-location page some orgs already have (see the
   "Steve & Kate's Camp Upper West Side" / generic "Steve & Kate's Camp" pattern already in this queue).
   If no per-location page exists, the org's main site is an acceptable shared `sourceUrl` for more than
   one child ONLY if you've independently confirmed each location is real — never invent an address to
   make a location "count."
2. **An aggregator/directory page that actually lists N real, distinct businesses**, extracted as if it
   were one entity. Each child needs its own real source — usually that business's own direct site if
   findable (search for it, the way every aggregator-contamination fix this session did), or a specific,
   real listing/section of the aggregator page if that's genuinely the only source and it's specific
   enough to that one business (not the same generic roundup URL repeated for every child — see the
   "no two children may share a source" rule below).
3. **Two real orgs' facts mashed into one record under one name** (a fabricated-identity case, e.g. Big
   Apple Swim School / Big Apple Academy). Splitting is the right fix ONLY once you've independently
   found each real org's OWN separate source — if you can't find a second real source, this isn't a
   splittable card, it's an unfixable one; leave it `QUARANTINED` with the conflation documented (as
   every fabricated-identity case in this run's Changelog already was) rather than fabricating a second
   source just to make a split possible.

**Hard rules, not suggestions:**
- Every child needs its own distinguishing `sourceUrl` (`contentCards`) or `website` (`providers`) — no
  two children in the same split may share one. This is enforced by the endpoint itself (a 400, not a
  warning) and is what actually distinguishes a real split from just relisting the same bad source twice.
- Always dry-run first, same as every other write this bridge does — `dryRun` defaults to `true` and the
  response previews every generated child ID before anything is written.
- `contentCards` children land in `state: "DISCOVERED"` — they go through the SAME real
  extract/score/publish-gate pipeline any other freshly-discovered card does; this bridge never
  publishes them directly, same as everywhere else in this doc.
- `providers` children are ALWAYS created `visibility: "hidden"`, regardless of what you pass — a raw
  insert into `providers` has no publish gate at the database layer at all (confirmed: no uniqueness
  constraint on `providers.id` exists), so this is the one thing standing between a split and something
  silently going live unreviewed. Un-hiding a split-off provider is a main-app action, not something
  this bridge can do.
- The parent gets `state: "BLOCKED_TERMINAL"` (`contentCards`) or `qualityStatus: "quarantined"` +
  `visibility: "hidden"` (`providers`) with the children's IDs recorded — never a new state value
  invented on either collection, and never left `PUBLISHED`/`active` pointing nowhere useful.

**What this does NOT do**: there is still no automated detection of "this card should be split" — that
judgment (does this source actually describe N real things, and can each one be independently sourced)
is made by whoever is running the review loop, the same way every other decision in this doc is. The
main `classscout` repo has no automated multi-entity extraction either (confirmed by reading its own
code — a `locationGroup.ts` comment explicitly calls this "a follow-up," not yet built there); recommend
that as the real long-term fix for pattern #1 above (extraction creating N location-specific cards up
front instead of one generic one) since it has the source-page context this bridge never will.

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

## An out-of-market entity (wrong city entirely) can get a fabricated NYC borough/neighborhood (found 2026-08-07)

A `contentCards` record was a real public school — Governors' Village STEM Academy (Upper), run by
Charlotte-Mecklenburg Schools in Charlotte, North Carolina (confirmed via the site's own repeated
references to Charlotte/Mecklenburg County) — with zero connection to New York City. Discovery had still
assigned it `boroughGuess: "Manhattan"` / `neighborhoodGuess: "Upper West Side"`, both fabricated with no
factual basis at all — not a wrong-borough-within-NYC mistake, a wrong-*city* mistake. It was already
correctly `state: "QUARANTINED"`, but the stored `terminalReason` (`weak_location_evidence`, …) undersold
the real problem, reading like a fixable NYC-evidence gap rather than "this isn't in our market at all."

**Fix pattern**: clear the fabricated borough/neighborhood guesses entirely (don't leave a false NYC
location standing just because some field must be non-empty), and rewrite `terminalReason` to name the
real reason plainly (e.g. `out_of_market_wrong_city: ...`) so a future reviewer never mistakes this for a
fixable location gap. Add `policy_or_safety_review` to `blockerCodes` alongside the existing ones to mark
it as categorically wrong, not just weakly evidenced.

## Off-topic, non-provider web pages can enter discovery entirely — the most severe contamination found this run (found 2026-08-07)

Three consecutive `contentCards` records (`cc-9687eb501e67896f3057ddd6`, `cc-65bc326e96da00fb4f9f724a`,
`cc-bebfbed864a8626764d27443`) were all `support.google.com` **YouTube Help** articles — "Submit A
Copyright Removal Request," "Verify Your Youtube Account," "How to Earn Money on Youtube" — with zero
connection to children's activities, camps, or classes of any kind. `sourceAuthorityGrade` was
`"authoritative"` on all three (technically true of support.google.com in general, but meaningless here),
and discovery had still assigned fabricated `boroughGuess: "Manhattan"` / `neighborhoodGuess: "Upper West
Side"` / `categoryHint: "Classes"`. This is worse than the aggregator-source pattern (a roundup page that
at least *mentions* real camps) — there is no real-world entity here at all, just an unrelated Google
support page that happened to get crawled.

All three were already correctly `state: "QUARANTINED"` / `operationalVisibility: "quarantined"`, so
visitor-facing risk was already contained — but the stored `terminalReason` values didn't reflect the
real problem. **Fix pattern**: same as the out-of-market case above — clear the fabricated
borough/neighborhood/category fields, rewrite `terminalReason` to state plainly that this is off-topic
source contamination (e.g. `off_topic_source_not_a_provider: ...`), and add `policy_or_safety_review` to
`blockerCodes`. **Recommend to the core team**: `support.google.com` (and likely other help-center /
platform-support domains) should probably never be eligible as a `live_discovery` source host at all —
this isn't a one-off, it was three records from the same discovery period, suggesting whatever query or
crawl step surfaced them isn't filtering by topical relevance before ingesting a URL as a candidate.

## Tooling fix: the read endpoint's `&id` parameter was silently ignored (fixed 2026-08-07)

`GET /api/card-bridge/rows` accepted an `&id=<value>` query parameter in every card-fetch call made
throughout this run, but the handler never actually read it — only `limit` and `filter` were wired up.
A request like `?collection=contentCards&id=cc-xxx` silently fell back to returning the current
globally-oldest row(s), ignoring the requested id entirely. This was caught when two supposedly-different
`&id` lookups both returned the same record.

No *write* was ever affected — `POST /api/card-bridge/update` already does a real per-id lookup, verified
by its own `before` diff on every call — and no fetch-by-id call in this run had actually returned a wrong
record before this either, because the deterministic-oldest workflow only ever asks for the id that is
*already* the current oldest row, so the (bugged) "ignore id, return oldest" behavior happened to coincide
with the correct answer every time until a record got touched between listing and fetching.

**Fixed** by giving `&id` real handling in `src/pages/api/card-bridge/rows.ts`: it's now translated to
`{[idField]: id}` merged into the Mongo filter (using each collection's own `idField` — `contentCardId` for
`contentCards`, `id` for `providers`/`meetupGroups`, etc.), and passing both `&id` and `&filter` together is
now a 400 rather than one silently winning. Before this fix, the reliable way to fetch one specific record
was `&filter={"<idField>":"<value>"}` — that still works and always did.

## A record can be genuinely real even though its only source failed to fetch — verify independently before treating it as unfixable (found 2026-08-07)

`cc-9c5fa54470883203b62fc67c` ("Creativity Soccer Pro") was `state: "QUARANTINED"` with
`policy_or_safety_review` set — its only `sourceUrl` was a `hisawyer.com` blog roundup post that returns
`fetch 403` (bot-blocked). On the surface this looks like the aggregator/off-topic pattern: no usable
extracted facts, a secondary source, a policy blocker already applied. But an independent web search
confirmed Creativity Soccer Pro is a real, distinct Brooklyn kids' soccer program with its own direct site
(`creativitysoccerpro.com`), a Yelp listing, a Facebook page, and several named Brooklyn program locations.
The aggregator page just happened to be a bad pick for a source, not evidence the entity is fake.

**Distinguish this from real aggregator/off-topic contamination before quarantining as unfixable**: search
for the entity by name before accepting "source unreachable + no facts" as proof it doesn't exist. If it's
real, `sourceUrl` is read-only through this bridge so it can't be repointed directly — instead move
`state` to `BLOCKED_REPAIRABLE` (not `QUARANTINED`), drop `policy_or_safety_review` (the real block is a
fixable bad source, not an off-topic/fabricated entity), and write a `terminalReason` naming the correct
direct-source domain so a future enrichment pass knows exactly what to re-fetch instead of the aggregator
page. When the confirmed entity has multiple locations and no single obvious HQ, leave `neighborhoodGuess`
at the borough level rather than picking one venue — same reasoning as the touring-program pattern above.

## Records referencing organizations with well-known acronym names can have their `title` mis-cased (found 2026-08-07)

Two cards this batch had a `title` that mechanically title-cased a real acronym into a normal word:
"Arts in Action Vap" (the org's own site title is "Arts in Action VAP") and "Nyu Langone Parent &
Postpartum Support" (should be "NYU Langone …"). Both are otherwise-correct records — same organization,
same location — just with the acronym's capitalization lost, most likely by a generic title-case
normalization step somewhere in extraction that doesn't know which words are acronyms. **Fix pattern**:
when a record's own official site or a well-known public identity (a university, a named program) uses a
capitalized acronym, correct `title` to match — this is a cheap, high-confidence fix, not a judgment call.

## A `neighborhoodGuess` can be a vague compass-direction placeholder instead of a real NYC neighborhood name (found 2026-08-07)

`cc-6d334b1b29b839f5931309c1` (Chelsea Piers Field House) had `neighborhoodGuess: "Downtown/West Side"` —
not a real, recognized NYC neighborhood, closer to a fallback guess than an actual place name. The real
answer was available cheaply: Chelsea Piers' own well-known location (Pier 62, 17th-23rd St along the
Hudson) places it squarely in Chelsea. **Fix pattern**: treat a `neighborhoodGuess` that reads like a
direction or a slash-joined compromise ("Downtown/West Side", "Midtown/Uptown") as a signal to look up the
real, single, standard neighborhood name for a well-known address rather than accept the vague guess as
good enough.

## A bot-blocked *official* domain is a different failure than a bad aggregator source pick, but gets the same fix (found 2026-08-07)

`cc-9d30c55f3acb35abc7840c86` (El Museo del Barrio Family Programs) was `QUARANTINED` with
`policy_or_safety_review` set, `sourceUrl` already the museum's own correct official domain
(`elmuseo.org`) — but that domain returns `403` for both the pipeline's fetch and a direct re-check,
almost certainly scraper/bot protection rather than a real outage. This is a distinct failure mode from
the Creativity Soccer Pro case above (there, the source itself was the wrong pick — an aggregator page —
even though a better direct source existed); here the source was already right, it's just currently
inaccessible to automated fetchers. Independent search confirmed El Museo del Barrio is a major, very
well-known East Harlem museum with well-documented recurring family programming (monthly free Super
Sábado festivals, Three Kings Day, Day of the Dead, K-12 group visits).

**Fix pattern**: same corrective shape as the bad-source-pick case — move `state` from `QUARANTINED` to
`BLOCKED_REPAIRABLE`, drop `policy_or_safety_review` (misapplied to a real, on-topic, extremely
well-established institution), and write a `terminalReason` that names the real cause (bot-blocked
fetch, not a fabricated/off-topic entity) so a future pass knows to retry the fetch — possibly with a
different method — rather than treat this as unfixable.

## A `boroughGuess`/`neighborhoodGuess` can be a flat-out wrong borough for a real multi-location business (found 2026-08-07)

`cc-0db68ccdb770e32dc68e24c9` (Penguin City Swim) had `boroughGuess: "Brooklyn"` /
`neighborhoodGuess: "Brooklyn Heights"`, but independent search confirmed Penguin City Swim has **zero**
Brooklyn locations — its real locations are three in Manhattan (Midtown East, John Jay College near
Columbus Circle, the Moise Safra Center on the UES) and one in the Bronx (Riverdale); its own homepage
text mentions only "Manhattan," never Brooklyn. This is a plain wrong-borough hallucination, distinct
from the earlier-documented wrong-borough-via-bad-geocode pattern — here there's no address-text or geo
data to blame, the borough/neighborhood guess itself is simply invented. A separate, correctly-labeled
sibling record for the same business (`cc-a46d53aaa7b92ec8569a4081`, "Penguin City Swim Upper West Side")
confirms the pipeline *can* get this business's location right — this one instance just didn't.

**Fix pattern**: when a business has multiple real locations and no address text to check, search for the
business by name to get its actual location list before trusting a stored borough. Correct to the
dominant/most-supported borough and set `neighborhoodGuess` to a borough-level placeholder like `"Multiple"`
rather than inventing a specific neighborhood — same reasoning as the touring/multi-location pattern
already documented (Puppetsburg, Brooklyn Crescents).

## The worst-case off-topic-contamination outcome: it reaches `PUBLISHED`/`active` with no blocker at all (found 2026-08-07)

Every off-topic contamination case earlier in this run (the `support.google.com` YouTube Help cluster,
the Charlotte NC public school) was at least caught and `QUARANTINED` before going live — wrong, but
contained. Two cards near the end of this run were not caught at all: `cc-ea60bc8db1446724644eea7a`
("Welcome to Gift Lms") was `state: "PUBLISHED"` / `operationalVisibility: "active"` with **no**
`blockerCodes` — its `sourceHost` was `lms.gift.edu.pk`, the login page for GIFT University in
Gujranwala, **Pakistan** — and `cc-9a3f4490e64900528d60ed14` ("How to Improve Your English Speaking") was
also live and unblocked, sourced from `learnenglish.britishcouncil.org`, a general English-learning
article with nothing local or business-like about it at all. Both had fabricated `boroughGuess: "Manhattan"`
/ `neighborhoodGuess: "Upper West Side"` and were visible in exactly the same way a real, correct card
would be.

This is a more severe failure mode than a wrong blocker or a stale one — here there is no quarantine
signal whatsoever to notice; the only tell is that the `title` and `sourceHost` don't describe an actual
local business, school, or organization. **Recommend to the core team as a priority**: audit live
`PUBLISHED`/`active` cards for `sourceHost`s that are generic informational, reference, or platform-help
domains (`.gov`-style government portals in other countries, general-audience learning sites, video
platforms' own help centers, e-commerce/software login pages) rather than an actual local entity's own
site — this run found two such cards by chance while working through a strictly oldest-first queue, which
suggests there are very likely more elsewhere in the collection that a purely oldest-first sweep hasn't
reached yet.

**Fix pattern applied**: same as the already-quarantined off-topic cases — clear the fabricated
borough/neighborhood/category fields, move `state` to `QUARANTINED`, and write a `terminalReason` naming
the real problem plainly, with `policy_or_safety_review` in `blockerCodes`.

## A third confirmed instance of the zero-blocker off-topic-contamination gap: a manufacturer's e-commerce page (found 2026-08-07)

The globally-oldest record in the pool (`cc-854c0e40e153afb2891ec461`, `updatedAt` 2026-06-20 — untouched
since creation) was `title: "Replacement Parts - Step2"`, `state: "PUBLISHED"`, `blockerCodes:
["low_source_trust"]`. Its `sourceUrl` is Step2's (a children's outdoor-toy/playset manufacturer) own
e-commerce "Replacement Parts" checkout page — not a children's activity/class provider by any reading.
`categoryHint: "Classes"` and `boroughGuess/neighborhoodGuess: Manhattan/Upper West Side` were both
fabricated with no factual basis, same as every other case in this pattern family.

**What makes this a third confirmed instance of "The worst-case off-topic-contamination outcome" (above),
not just another aggregator case**: a cross-collection lookup found this content card had already
produced a **live `providers` record**, `prov-replacement-parts-step2`, and that live record had **zero**
`qualityStatus`/`visibility` set at all — fully public, no quarantine signal whatsoever. Its
`shortDescription`/`longDescription` were scraped cart/checkout/nav chrome verbatim ("Subtotal $0.00 Taxes
and shipping calculated at checkout... Secure Checkout... Splish, Splash & Relax..."), and its one
"recurring program" (`Monday`/`Friday`, `8:00am - 5:00pm`) was Step2's own store hours, not a class
schedule — a detail worth checking on its own: a "schedule" that's actually business hours is itself a
signal the record isn't describing a real program at all. Unlike the Pakistani-university-LMS and
British-Council cases above, the *contentCard* here did carry one blocker (`low_source_trust`) — but the
live, family-facing `providers` record it produced carried none. **The blocker existing upstream on the
content card is not proof the live record is protected** — this run's real evidence is that it wasn't.

**Fix pattern applied (mirrors the two cases above, on both collections since a live record existed)**:
- `contentCards`: `state` → `QUARANTINED`, `categoryHint`/`boroughGuess`/`neighborhoodGuess` cleared
  (not left as false NYC location data), `blockerCodes` gained `policy_or_safety_review` alongside the
  existing `low_source_trust`, `terminalReason` naming the real problem plainly
  (`off_topic_source_not_a_provider: ...`).
- `providers`: `qualityStatus: "quarantined"` + `visibility: "hidden"` (Decision Matrix C) — the live
  record is now hidden from families, same one-directional action as every other providers quarantine.

**Recommend to the core team, reinforcing the v33 finding**: this is now a *third* confirmed live/public
instance of the same root gap (the two v33 cases plus this one), found simply by picking up the
globally-oldest record in the pool — i.e., not from a targeted sweep, an ordinary loop iteration surfaced
it. This raises confidence that the priority audit recommended in v33 (scan `PUBLISHED`/`active` records
for `sourceHost`s that are generic e-commerce/informational/platform domains rather than an actual local
entity's own site) would find more, and that relying on `blockerCodes` alone to gauge live-record safety
is not sufficient — the content card's own blocker did not prevent this from publishing.

## A fourth confirmed instance, this time with zero blockers on BOTH records: a media app's own App Store listing (found 2026-08-07)

The very next globally-oldest record after the case above (`cc-77deeeb03a1ad8b054aba8dd`, `updatedAt`
2026-06-20 — the second-oldest record in the entire pool) was `title: "‎ Youtube App - App Store"`,
`state: "PUBLISHED"`, **`blockerCodes: []`** — zero blockers on the content card itself this time, unlike
the Step2 case. `sourceUrl` is `https://apps.apple.com/us/app/youtube/id544007664`: the YouTube mobile
app's own Apple App Store listing page. No reading of this source supports treating it as a children's
activity/class/camp provider operating in New York City — it is a media platform's app-store marketing
copy, nothing more.

A cross-collection lookup found the same pattern as before: this content card had already produced a
live `providers` record, `prov-youtube-app-app-store`, again with **zero** `qualityStatus`/`visibility`
set. Its `shortDescription`/`longDescription` are raw App Store
description text, ending with an unrelated scraped customer review complaining about a welding-program
enrollment ("DOR pay to Advance career institute welding program around $13,000 for 36 weeks... I withdrew
welding program.") — evidently scraped along with the App Store page's own review section and folded into
the description as if it were part of the app's copy. That same review fragment was also used verbatim as
the `recurringPrograms[0].timeText` — i.e., a completely unrelated customer complaint about an unrelated
program stood in as this "provider"'s class schedule. `activityTypes` (`Sports, Art, Music, Martial Arts,
Theater, Language, Soccer`) is an ungrounded grab-bag with no connection to the source at all.

**Guiding principle applied (owner directive, 2026-08-07 — see `CLAUDE.md`)**: the reality check comes
before the field-level check. Neither of these two records needed a field-by-field audit to catch —
the first and only question that mattered was "does this describe a real entity that operates a
children's activity for NYC families," and the answer was no for both. When that answer is no, the
correct action is to protect families by quarantining, not to look for a field-level fix that doesn't
exist.

**Fix pattern applied (identical to the case above)**:
- `contentCards`: `state` → `QUARANTINED`, `categoryHint`/`boroughGuess`/`neighborhoodGuess` cleared
  (fabricated), `blockerCodes` gained `policy_or_safety_review`, `terminalReason` naming the real problem.
- `providers`: `qualityStatus: "quarantined"` + `visibility: "hidden"`.

**Recommend to the core team**: this is now a *fourth* confirmed live/public instance of the same root
gap, and the second in a row found by simply working the globally-oldest-first queue — these two cases
were the #1 and #2 oldest-updated records in the ENTIRE pool, both untouched since their original
`createdAt` in June, both off-topic, one with zero blockers on both its content card and its live
provider record. This strongly suggests the oldest end of the queue (the earliest discovery runs) is
disproportionately where this contamination lives, and a targeted sweep of old, never-re-reviewed
records — not just continued oldest-first processing — would likely surface more of these quickly.

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
- v20 (2026-08-07): during a 100-card mass-enrichment run: (1) extended the fabricated-identity section
  with a second sub-pattern — a record's own NAME mashing together two unrelated real organizations,
  with location fields describing one org and content fields describing the other
  (`prov-edgies-teen-center-shorefront-y-kids-programs` — Manhattan's Edgies Teen Center content stored
  under Brooklyn's Shorefront Y's location); (2) added "Template/webbuilder placeholder values in
  contact fields" after finding `555-555-5555`/`mymail@mailservice.com` stored as real phone/email
  (widened `providers.email` to writable to allow fixing this, alongside the already-added `.name`);
  (3) added "Redundant near-duplicate values wasting the activityTypes cap" after finding three
  same-concept strings (`"STEM / Science"`, `"STEM"`, `"Science"`) filling all 3 cap slots. The shared-
  placeholder-geo count also reached six confirmed instances and the spurious-generic-activityType
  pattern gained new off-topic values (`"Tutoring"`) beyond the already-documented Art/Music.
- v21 (2026-08-07): during the same 100-card mass-enrichment run, cards 11-20 surfaced three more
  patterns. "A record's own name can name its location" — four cases where a record's own name specified
  a borough/neighborhood that its stored borough/neighborhood/address contradicted (Chelsea Piers Tennis
  Brooklyn, Impact Coaching Network Chess Brooklyn, Goldfish Swim School Gowanus, Karate City UWS) — this
  is now a specific, cheap cross-check to run on every card. A more severe never-downgrade blind spot: an
  `exact`/`google`-sourced geo pin can be confidently wrong-BOROUGH, not just imprecise, when it was
  geocoded from a wrong address that a record's own name would have caught. And a new address-field
  failure mode: fully garbled non-address text (`"6-12 summer Institutes takes place"`) landing in the
  address field, worse than the usual neighborhood-restatement placeholder.
- v22 (2026-08-07): cards 21-30 of the same mass run added three findings. A second shared-placeholder-
  geo cluster (`"Manhattanville, Manhattan, NYC"` → the identical pin on 3 unrelated records) confirms
  this is a general pipeline failure mode, not a one-off string — expect more clusters with different
  placeholder text. A subtler activityType-contamination variant: a sentence about players' linguistic
  diversity got misread as a `"Language"` activity offering. And a caution on wrong-entity-kind
  judgment: an advocacy-heavy description can still front a real, listable kids program — verify before
  quarantining on the strength of surface tone alone. The spurious-"Music" count reached seven.
- v23 (2026-08-07): cards 31-40 of the same mass run added three more findings. A touring/itinerant
  program (Mozart for Munchkins, performing at many venues across multiple cities) has no single correct
  address — write an honest non-specific description with `addressConfidence: "unknown"` rather than pin
  one incidental venue. Live/operational status (a museum's temporary renovation, a football team
  displaced by park construction) shouldn't be written into permanent description text — describe the
  org's durable offerings, not its current construction/relocation status. And a record can point to the
  wrong domain when an org runs both a B2B curriculum-licensing brand and a separate B2C consumer site
  (Musicolor Method) — flag the mismatch since `website` is read-only, and source the real description
  from the correct (family-facing) domain. The extraction-failure-text pattern reached three confirmed
  instances; the spurious-"Music" count reached nine.
- v24 (2026-08-07): cards 44 and 47 of the same mass run surfaced a severe new pattern — added "A
  completely unrelated company can contaminate a record by name coincidence alone" after two cases
  where a wrong `sourceUrl` pulled in a totally unrelated business (a podcast-software company named
  Riverside; Sky UK, a British satellite TV provider) purely because it shared one common word with the
  real local organization's name. Distinct from fabricated-identity (same general space, wrong specific
  business) — this is a different industry entirely. Recommend the core team check whether short,
  single-common-word business names are systematically vulnerable to this in the domain-resolution step.
- v25 (2026-08-07): reached the halfway point (50/100) of the mass-enrichment run. Cards 41-50 mostly
  reinforced already-documented patterns (a third wrong-source-by-name-coincidence case, this one
  unsalvageable and quarantined; more spurious-"Music" instances) and added one nuance to the
  aggregator-sources section: an aggregator sourceUrl can contaminate just `activityTypes` even when the
  main description reads clean and accurate — check tags against the source independently of description
  quality.
- v26 (2026-08-07): the mass-enrichment run exhausted the `providers` never-touched queue and moved to
  `contentCards` (per the cross-collection oldest-first rule) — added two `contentCards`-specific
  findings. A `source_unreachable` blocker can be a stale false positive: a card parked for two months
  on a 404 that no longer reproduces — re-check the URL yourself before trusting a stored blocker, and
  clear it (recommending re-enrichment) if it's wrong. And the aggregator-source pattern applies to
  `contentCards` too, using its own real `state: "QUARANTINED"` value plus `terminalReason`, distinct
  from the `qualityStatus`/`visibility` mechanism used on `providers`/`meetupGroups`.
- v27 (2026-08-07): cards 59-60 reached the halfway point of the second 50 (60/100 overall). The stale
  source_unreachable blocker pattern reached a second confirmed instance (both `sourceAuthorityGrade:
  "official"` — the low-trust blocker directly contradicted the source's own official grade even before
  re-checking). Also found an aggregator-source detection inconsistency worth flagging to the core team:
  two aggregator-sourced cards from the same discovery period — one correctly quarantined by the
  pipeline, one left published/parked with no aggregator-related blocker at all.
- v28 (2026-08-07): widened `contentCards.title` to writable after finding the same name-extraction
  defect already documented for `providers.name` on this collection too (`title: "Camps"` when the
  card's own extracted facts already named the real org, "Manhattan Youth").
- v29 (2026-08-07): cards 63-67 surfaced the two most severe contamination patterns found this run —
  "An out-of-market entity (wrong city entirely)" (a Charlotte, NC public school fabricated into a
  Manhattan/UWS guess) and "Off-topic, non-provider web pages can enter discovery entirely" (three
  `support.google.com` YouTube Help articles, no real-world entity involved at all, worth flagging to
  the core team as a discovery-source-host filtering gap). Also fixed a real tooling bug found while
  investigating why two `&id` lookups returned the same record: `GET /api/card-bridge/rows` never
  actually read its own documented `&id` parameter, silently falling back to "return the current oldest
  row" instead — no write was ever affected, but reads by id were unreliable. Fixed and pushed
  separately (`src/pages/api/card-bridge/rows.ts`).
- v30 (2026-08-07): reached 70/100 of the mass-enrichment run. The stale source_unreachable/
  low_source_trust blocker pattern reached a fourth confirmed instance (a second, separate `contentCards`
  record for Marlene Meyerson JCC Manhattan, plus Silver Music) — all four share the exact same signature
  (`official`-grade source, `official_available` already recorded, contradicted by the stored blocker),
  strengthening the recommendation that the core team root-cause this rather than treat each instance as
  one-off.
- v31 (2026-08-07): reached 80/100. Cards 71-80 added the sixth confirmed stale-blocker instance (Amazing
  Athletes) and three new findings: a record can be genuinely real even when its only source fails to
  fetch (Creativity Soccer Pro, confirmed real via independent search, moved from `QUARANTINED` to
  `BLOCKED_REPAIRABLE` rather than treated as unfixable); a `title` can lose a real acronym's
  capitalization to generic title-casing ("Arts in Action Vap" → "VAP", "Nyu Langone" → "NYU Langone");
  and a `neighborhoodGuess` can be a vague compass-direction placeholder ("Downtown/West Side") instead of
  a real neighborhood name (corrected to Chelsea for Chelsea Piers Field House).
- v32 (2026-08-07): reached 90/100. The seventh confirmed stale-blocker instance (Puppetsburg) and the
  fifth `support.google.com` YouTube Help off-topic instance. Two new findings: a bot-blocked *official*
  domain (El Museo del Barrio, `403` from real scraper protection, not an outage) gets the same
  `BLOCKED_REPAIRABLE` treatment as a bad-source-pick, but is a distinct failure mode worth naming
  separately in `terminalReason`. And a `boroughGuess` can be a flat-out wrong borough with no bad
  geocode or address text to blame (Penguin City Swim tagged "Brooklyn" with zero real Brooklyn
  locations) — confirmed and corrected by searching the business's real location list directly.
- v33 (2026-08-07): **the 100-card mass-enrichment run is complete.** Cards 91-100 added an eighth
  stale-blocker instance (Ferox Athletics), a third acronym-title-casing fix (JCC), and a third confirmed
  instance of "real entity, bad source pick" (Riverside Park Conservancy — its `sourceUrl` was a literal
  Google search-results page, not the org's own site) plus a fourth (Peridance Center — a genuine
  fetch-size failure on an already-correct official domain, also fixing a vague `"Manhattan"`
  neighborhood placeholder to the real one, Union Square). Most importantly, found and documented the
  worst-case failure mode of the run: "The worst-case off-topic-contamination outcome" — two cards (a
  Pakistani university's LMS login page; a British Council English-learning article) were live
  `PUBLISHED`/`active` with zero blockers, not caught by quarantine at all, unlike every other off-topic
  case this run. Flagged as a priority audit item for the core team.

  **End-of-run summary (100/100):** processed cards from both `providers` and `contentCards` (switching
  collections mid-run per the deterministic cross-collection oldest-first rule). Recurring defect
  patterns confirmed at scale: 9 spurious-"Music"-activityType instances, 8 stale
  `source_unreachable`/`low_source_trust` blocker instances (all sharing one signature — an `official`
  source contradicted by its own recorded history), 8 `support.google.com`/YouTube-Help off-topic
  contamination cards (one cluster from a single discovery run), 2 shared-placeholder-geo clusters, and
  4 confirmed "real entity blocked by a bad or failed source fetch" cases resolved to `BLOCKED_REPAIRABLE`
  rather than left unfixable. Two cards were the single most severe finds of the run: live, published,
  fully off-topic content (a foreign university's LMS, a language-learning article) with no blocker
  whatsoever. Registry/tooling shipped to `classscoutcards` during the run: `providers.email`,
  `providers.name`, and `contentCards.title` all made writable for the first time (each after finding a
  real defect the bridge previously had no way to correct), and a real bug fixed in the read endpoint
  (`&id` was silently ignored, always falling back to "return the oldest row"). All fixes were dry-run
  verified before every apply, and no write ever touched `classscout` — only `classscoutcards`.
- v34 (2026-08-07): the `/stats` page and its API now group `boroughGuess`/`neighborhoodGuess` using the
  **same canonical location logic the main app itself uses** (ported into `src/lib/delivery/
  locations.ts` — `findCanonicalBorough`/`findCanonicalNeighborhood` from `src/data/locations.ts`, plus
  an LA area/neighborhood equivalent this repo adds since none existed to port), instead of raw-string
  grouping — a messy value like `"Manhattan/Brooklyn"` now buckets into an explicit `"(unresolved)"`
  group rather than polluting a real borough's count, and this surfaced a real, useful finding on its
  own: roughly a quarter of `contentCards` bucketed under a resolved `Manhattan` still have a
  `neighborhoodGuess` that doesn't canonicalize to any real NYC neighborhood. Every count now also shows
  a published/not-published split, and a card-level "Sport Cards" summary was added (one card counts
  once even with multiple sport tags — see `sportActivity.ts` for the best-effort classifier, since the
  main app has no sport taxonomy to port). Also added `POST /api/card-bridge/split` (see its own section
  above) — the first capability in this repo that inserts new documents rather than only updating
  existing ones, built to handle the multi-location, aggregator-multi-business, and
  independently-re-sourced-conflated-identity splitting scenarios all found during the 100-card run.
- v35 (2026-08-07): a single ordinary loop iteration (pulling the true globally-oldest record, per step 1)
  landed on a third confirmed instance of the v33 zero-blocker off-topic-contamination pattern — see "A
  third confirmed instance..." above. Quarantined both the source `contentCards` record and the live
  `providers` record it had already produced. Notable because it wasn't found by a targeted sweep; the
  oldest-first queue surfaced it on its own, reinforcing that this gap is not rare.
- v36 (2026-08-07, owner directive): codified "children's safety comes first" as an explicit, standing
  principle (also added to `CLAUDE.md`) — verify a card describes a REAL entity actually operating a
  children's activity for NYC families BEFORE judging whether its fields are individually correct; when
  that check is negative or unconfirmed, default to protecting families over giving the record the
  benefit of the doubt. The very next loop iteration after v35 (the #2 oldest-updated record in the whole
  pool) confirmed why this matters at scale: a fourth instance of the same contamination pattern, this
  time a media app's own App Store listing, with zero blockers on BOTH the content card and its live
  provider record — see "A fourth confirmed instance..." above. Both records quarantined.
