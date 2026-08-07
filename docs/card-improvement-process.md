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
- [ ] **Physical-only check (owner directive, 2026-08-07, part of the reality check in `CLAUDE.md`)**:
      does this describe a real, physical, brick-and-mortar location a child actually attends? An
      e-commerce/shopping platform, a social media platform, or a pure online-only service is
      categorically prohibited regardless of how internally tidy the rest of the record looks —
      quarantine on sight, no field-level fix exists. This is about the ENTITY, not the source
      domain: a real physical business whose only findable source is a social-media-hosted page is a
      "real entity, bad source" case, not a prohibition — investigate before assuming. A real
      brick-and-mortar business that also offers an online/virtual option stays in scope; only strip
      the online-class language, don't quarantine.
- [ ] **Multi-location check**: does research reveal the organization operates more than one distinct
      real physical location? If so, this is a split candidate (`POST /api/card-bridge/split`) — one
      card per location — not a single generic record to leave standing with a vague/multi-value
      borough or `neighborhoodGuess: "Multiple"`.
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

**Content-quality/data enrichment is a rigid, standing requirement, not an optional nicety (owner
directive, 2026-08-07 — see `CLAUDE.md`)**: passing the reality check is not the finish line for a real
card. A generic, identical-in-both-fields placeholder description, a borough-level-only address when a
real street is findable, or a schedule field polluted with leaked scraper/pipeline metadata are all
defects to fix on every review pass, the same tier as the prohibition checks above — not something to
reach for only when there happens to be time left over. See "First real description/copy enrichment..."
below for the concrete precedent this standard is built from.

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

## Cap `activityTypes` at 3, and name the real headline activity via `primaryActivityType` (owner directive, 2026-08-07; superseded 2026-08-07 by real top-3 SELECTION logic, not just a length cap)

**Original version of this rule (kept for history): "take the source's own first 3, in source order."**
That was wrong on its own terms — "first 3 in source order" is exactly how a genuinely unrelated activity
(see "A spurious 'Music' activityType..." below, and the real "Basketball School" case that prompted this
rewrite: research found `["Music", "Basketball", "Sports", "Soccer", "Handball"]` in THAT order, purely
because a "Music" keyword pattern happened to fire first during discovery) ends up kept in the top 3 while
a genuinely-related one gets cut. Order-of-discovery was never a signal of relevance.

**The real rule now (owner directive, 2026-08-07): the top 3 must be the primary activity plus only
OTHER activities from the SAME topical cluster as the primary — never a positional trim.** This bridge
now enforces this automatically, not just as review guidance: `src/lib/delivery/activityAlignment.ts`'s
`alignActivityTypes()` is applied inside `applyCardBridgeWrite` to every `providers` write that touches
`activityTypes` and/or `primaryActivityType` (checked in both dry-run and apply, same convention as the
geo/serviceLeads guards). It:
1. Determines the primary activity — trusts an already-set `primaryActivityType` if it's still present in
   `activityTypes`, else matches the provider's own `name`/title against the candidates (e.g. "Basketball
   School" → "Basketball"), else falls back to the first candidate.
2. Groups the canonical activity vocabulary (mirrored exactly from the main app's own
   `extractionEngine.ACTIVITY_KEYWORDS` labels) into 4 clusters — Sports & Fitness, Arts & Performance,
   Academic & STEM, Play & Recreation — and keeps only OTHER candidates from the primary's own cluster.
   `["Music", "Basketball", "Sports", "Soccer", "Handball"]` with primary "Basketball" (Sports & Fitness)
   now correctly resolves to `["Basketball", "Sports", "Soccer"]` — Music (Arts & Performance) is cut,
   Handball is cut only for exceeding the 3-cap, not for being unrelated.
3. Caps at 3, always with the primary first.
4. An activity label the cluster map doesn't recognize (a custom/legacy tag) falls back to the OLD
   "top 3 in original order" behavior for safety, rather than aggressively dropping it to just itself.

**What this means for a manual review write through this bridge**: you no longer need to hand-curate the
top 3 by source order — submit whatever real candidate `activityTypes` you found (even more than 3;
`cardBridgeWrite.ts`'s own validation now only rejects an obviously-garbage-length list, >20 entries, not
a normal one) plus a `primaryActivityType`/`name` for the alignment to key off of, and the bridge computes
the correct, topically-coherent top 3 itself. Still worth recording anything you know was cut in the
write's `reason` text for the review trail, but it's no longer YOUR job to decide which 3 belong together.

**A second, separate defect this does NOT fix**: `src/components/scout/views/MyAccountView.tsx`'s
`SavedProviderCard` (the "My Account" → "Saved listings" card) reads `provider.activityTypes[0]` directly
for its "activities" metadata label, bypassing BOTH `primaryActivityType` and the top-3 alignment above —
every other real consumer (`ProviderCard.tsx`, `publicBrowse.ts`, `ListingImage.tsx`, `activityMatch.ts`)
already correctly reads `getPrimaryFirstActivityTypes()`/`primaryActivityType` first. This lives in the
main `classscout` repo, which is read-only from here (see `CLAUDE.md`) — the fix is a one-line change
(`provider.activityTypes[0]` → `getPrimaryFirstActivityTypes(provider)[0]`, importing the existing helper
from `@/lib/categoryBanner`) for whoever owns that repo to apply directly.

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

**A fifth instance shows the re-check can go the OTHER way, too (found 2026-08-07)**: `cc-a0ea07808aae9a8e53e77e80`
("Ninja Ballet Kids") was `state: "QUARANTINED"` with `terminalReason` including `source_rejected_or_unreachable`
from a `"page too large"` crawl failure. Re-fetching `ninjaballet.com` now returns a full, real 1.5MB page —
the site is genuinely reachable, exactly the same false-positive shape as the four cases above. But
unlike those four (real kids/family orgs wrongly blocked), re-verifying THIS source revealed the entity
itself is a real, professional, adult-oriented experimental dance company — ballet, martial arts (spear,
bo staff), meditation, a "Cosmic Dance Healing" sound-bath class delivered via Zoom — with no children's
program anywhere on the site. The card's own title, "Ninja Ballet Kids," had zero supporting content;
"Kids" was fabricated. **The lesson generalizes**: re-checking a stale `source_unreachable` blocker is not
a shortcut to "therefore clear it and republish" — it's a instruction to actually look at what the source
says now. Here the correct outcome was the SAME as before (stay quarantined) but for the ACTUAL reason
(not a children's activity at all, corrected via the physical-only/reality-check policy in `CLAUDE.md`),
not the stale, now-disproven one (source unreachable). Corrected `title` (dropped the fabricated "Kids")
and rewrote `terminalReason` to state the real finding; left `state: QUARANTINED` unchanged since that
part was already right.

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

**This exact pattern is now handled automatically, not just flagged for manual review** — see the rewritten
"Cap `activityTypes` at 3..." section above: `alignActivityTypes()` drops an out-of-cluster activity like a
spurious "Music" tag on a sports record as part of every `providers` write this bridge makes, using the
provider's own primary activity/title to decide what belongs, not source order.

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

### First real-world use, under the proactive one-card-per-location policy (2026-08-07)

`cc-9bbab6a42d8cfc4c2741ba77` ("Tennis Innovators NYC") was the first split actually applied, prompted by
the v38 policy (owner directive: any confirmed multi-location org should be split proactively, not only
when a review happens to notice). Its own site listed distinct dedicated pages, each with its own real
street address, for at least 5 physical locations: 94th St. Court (705 Columbus Ave, Manhattan/UWS),
John Jay College/59th St. Court (899 10th Ave btw 58th-59th St, Manhattan), UES 78th St. Jr. Academy
(78th St. btw Park & Lex, Manhattan), Fort Lee Racquet Club (Fort Lee, NJ), and Water Mill (35 Nowedonah
Ave, Water Mill, NY/Hamptons) — plus a "New York Tennis Club" partner location in the Bronx mentioned
only within the Fort Lee page's own text, with no dedicated page of its own.

**Split into 3 children**, the confirmed Manhattan locations each with their own genuinely distinct
source and real address. **Deliberately excluded, not fabricated**:
- Fort Lee (NJ) and Water Mill (Hamptons, NY) — real, physical, and each has its own dedicated source
  page, but neither has a canonical value in this platform's 5-borough `Borough` type
  (`src/lib/delivery/locations.ts`). Whether/how out-of-the-5-boroughs-but-serves-NYC-families
  locations should be represented (a new city-tenant value, the way `providers.city` already supports
  `"la"`? left out entirely? something else?) is a product-scope decision, not a data-fix — flagged here
  as a recommendation rather than decided unilaterally.
- New York Tennis Club (Bronx) — real and genuinely IN the 5-borough taxonomy, but its only textual
  mention is inside the Fort Lee page, which would make it share a source with the actual Fort Lee
  location — violating the split tool's own no-shared-source rule (see the hard rules above) and the
  broader "never fabricate a source" principle. Needs its own independently found source (the club's own
  site, if one exists) before it can be split out honestly.

**The existing live `providers` record** (`prov-tennis-innovators-nyc`) was itself an aggregator-style
mashup of the site's general "camps" page — an unverified `neighborhood: "Midtown"` (the only supporting
text was a stray, unconfirmed "MIDTOWN: The Courts Coming April 2023" mention mixed with unrelated nav
text), a spurious "Music" `activityTypes` tag on a tennis program (the same pattern documented earlier in
this doc), and description text describing camp offerings, not any one specific court. Quarantined
separately (Decision Matrix C) rather than folded into the split, since providers-collection splits force
`visibility: "hidden"` on every child regardless — replacing one already-live-but-wrong record with
several newly-hidden ones would have been a net loss of live coverage for zero gain; the correct fix
lives on the `contentCards` side, where the pipeline will re-process the 3 new `DISCOVERED` children
through its own real extract/score/publish-gate cycle.

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

**A fifth instance followed immediately** (`cc-42907e50611702c538085a7a` / `prov-how-to-add-voiceovers-
to-your-tiktoks`, the #3 oldest-updated record in the pool): a Mashable tech-news how-to article
("How to Add Voiceovers to Your TikToks"), scraped copy containing raw broken Alpine.js/HTML template
fragments rather than prose, zero blockers on the live `providers` record. Same fix pattern applied to
both records. Three off-topic instances in the three oldest-updated records checked in a row is no
longer "found by chance" — it is the queue's current leading edge, and reinforces that the priority
audit recommended above should happen before continuing pure oldest-first processing much further.

**Important boundary, so this isn't mistaken for "quarantine everything old"**: the #4 oldest-updated
record checked immediately after (`cc-9bbab6a42d8cfc4c2741ba77`, "Tennis Innovators NYC") is a real,
legitimate multi-location NYC tennis program (Upper West Side and Upper East Side courts, per its own
site) — not quarantined. Its gaps (`missing_age_range`, `missing_schedule`, `missing_official_image`)
are genuine repair-needed items requiring real enrichment, not fabrication or off-topic contamination.
The reality check is a check, not a blanket policy against old or currently-`PUBLISHED` records — it
still requires actually reasoning about the source each time.

## A second confirmed out-of-market instance, layered with an aggregator-style identity mashup (found 2026-08-07)

`cc-7301d08f62989749b1bd4450` / `prov-happy-kidz-yoga` ("Happy Kidz Yoga") extends the out-of-market
pattern documented earlier in this doc (Governors' Village STEM Academy, Charlotte NC): `sourceUrl`
(`funclubs.com/camps`) is a real camp-enrichment marketing company, but its own scraped text places it
"at Mt. Bethel Christian Academy in East Cobb, Marietta" serving "the Atlanta metro area" — Georgia, not
New York City. Discovery fabricated `boroughGuess: "Brooklyn"`; the live `providers` record carried a
fabricated `address: "Downtown Brooklyn, Brooklyn, NYC"` and a Brooklyn geo pin with no basis at all.

**Layered on top**: the extracted text mashes together three distinct, unrelated program offerings —
Happy Kidz Yoga, Marietta Martial Arts Karate Camp, and a Guitar Club — as if they were one entity's own
description, the same aggregator-style identity confusion documented earlier in this doc, just combined
with the wrong-market problem rather than appearing alone. Neither defect is fixable by a field-level
edit (there is no "correct NYC location" to supply, and no single one of the three programs can be
picked as "the real" Happy Kidz Yoga without fabricating that choice) — both records quarantined,
`boroughGuess`/`neighborhoodGuess` cleared rather than left standing as a false NYC location.

## A 5-card batch (2026-08-07): the oldest end of the queue is mostly stale-blocker false positives, not off-topic contamination

Working the next 5 globally-oldest records (all pre-publish `contentCards`, none with a linked live
`providers` record) after the off-topic-contamination run above found a different dominant pattern:
**4 of 5 were the `"page too large"`/`"fetch failed"`/`"fetch 403"` stale-blocker false positive already
documented** (`cc-a116f19d7a8892531ef1dfa0` Dance Atlantic, `cc-a273d040385ebd2c40f7f4b3` School of Rock
Huntington, `cc-a2f936b36185eb4921272f11` Blue Balloon Songwriting School, `cc-a494bab566ace22895ec3c37`
Hopalong Andrew), and the 5th (`cc-a37aa481de3f1400d4664291` Tim Morehouse Fencing Club NYC) was a real,
prominent multi-location business. **None were off-topic contamination or fabricated entities** — every
single one was a real, verifiable business or performer. This suggests the earlier off-topic-contamination
cluster (the #1-#3 oldest records) was itself an anomaly from one bad discovery run, while the broader
oldest end of the queue is dominated by real entities wrongly parked behind stale/bot/TLS source checks.

**Important limitation on what this bridge can actually fix here**: all 5 were pre-publish `contentCards`,
which have NO description/phone/email/address fields at all in this bridge's schema (`title`, `state`,
`categoryHint`, `boroughGuess`, `neighborhoodGuess`, `blockerCodes`, `terminalReason`, `enrichmentStatus`,
`incompleteFields` only — see `cardBridgeRegistry.ts`). Real contact/address/schedule facts found via
research (School of Rock Huntington's real address/phone/hours; Tim Morehouse's two real Manhattan
addresses) could only be recorded as prose in `terminalReason` for a future enrichment pass to use — this
bridge cannot itself populate a `providers.shortDescription`/`phone`/`address` field until the main app's
own pipeline has actually created a live provider record for the card. **Description/contact-detail
enrichment (this session's specific ask) only becomes directly actionable through this bridge once a
record reaches `providers`** — see the split's children in the case below, which will go through the
real pipeline and become enrichable this way once (if) they publish.

Per-card findings:
- **Dance Atlantic** — real Iowa dance studio (Atlantic, Oakland, Manning, IA), wrongly matched to
  Brooklyn by name coincidence (Atlantic → Atlantic Avenue). Out-of-market; `boroughGuess`/
  `neighborhoodGuess` cleared, `terminalReason` corrected, left `QUARANTINED`.
- **School of Rock Huntington** — real national franchise location, bot-blocked (a browser User-Agent
  loads it fine). Real address/phone/hours/age-graded programs found. Genuinely on Long Island, outside
  the 5-borough taxonomy — the SAME open scope question already raised for Tennis Innovators' Fort Lee/
  Water Mill. Moved `QUARANTINED` → `BLOCKED_REPAIRABLE` (a real entity blocked by a taxonomy gap, not a
  quality/safety problem); `boroughGuess: "Long Island"` left as-is (honest, not fabricated).
- **Blue Balloon Songwriting School** — real music-education business, but explicitly "in-home and
  virtual" with no fixed studio address of its own (a network of independent teachers). **A new sub-case
  of the physical-only policy**: distinct from the hybrid-business rule (a real fixed location that also
  offers an online option) — here there is no fixed venue at all to assign a borough/neighborhood to.
  Left `QUARANTINED`, `terminalReason` corrected to name this specific reason.
- **Tim Morehouse Fencing Club NYC** — real, prominent business (founded by an Olympic silver medalist,
  100+ Google reviews) with 4 real locations: 2 in Manhattan (Upper West Side, Midtown East — real
  addresses found and used) plus Westchester, NY and New Canaan, CT (again outside the 5-borough
  taxonomy). Split into 2 Manhattan location cards via the one-card-per-location policy; the out-of-
  taxonomy locations deliberately excluded, same as prior cases.
- **Hopalong Andrew** — a real, well-known NYC children's musician (Andrew Vladeck, a former NYC Urban
  Park Ranger), confirmed via independent web search (WNYC feature, KidPass listings, Riverside Park
  Conservancy, Brooklyn Bridge Parents) after his own site failed with a genuine, current TLS handshake
  error (a real problem, not a stale false positive like the other 3 — worth telling apart). Tours NYC
  parks/venues rather than operating from one address, matching the touring/itinerant-program pattern
  already in this doc (its `boroughGuess`/`neighborhoodGuess` left broad, not forced to one venue).
  `sourceUrl` is read-only through this bridge; `terminalReason` names working secondary sources for a
  future enrichment pass. Moved `QUARANTINED` → `BLOCKED_REPAIRABLE`.

**New policy nuance surfaced**: the physical-only rule (`CLAUDE.md`) needs an explicit "no fixed venue"
sub-case alongside the existing "hybrid business" sub-case — a business whose entire delivery model is
in-home/mobile/virtual, with no address of its own, fails the test even though real physical rooms (a
family's own home) are technically where the activity happens.

**Recommend to the core team, escalating a pattern now confirmed 3 times independently this session**:
Fort Lee NJ / Water Mill NY (Tennis Innovators), Long Island (School of Rock Huntington), and Westchester
NY / New Canaan CT (Tim Morehouse Fencing) are all real, well-documented physical locations serving
greater-NYC-metro families that this platform's 5-borough `Borough` type cannot represent at all. This is
no longer a one-off edge case — it recurred with 3 different real, prominent businesses in a single
session. Worth a real product decision (a new city-tenant value? an explicit "greater metro" category?),
not further individual flagging each time it's found.

## A 10-card batch (2026-08-07): the stale-blocker pattern generalizes far beyond a handful of instances

Continuing oldest-first past the 5-card batch above, the next 10 records were ALL from the same original
discovery run signature (`"page too large"` / bot-blocked / search-host source), and every single one was
a REAL entity — zero off-topic contamination, zero fabricated businesses. This confirms the 5-card
batch's finding at much higher confidence: **the dominant defect at this part of the queue is a systemic
stale-blocker/bad-source-pick problem on genuinely real NYC youth organizations**, not entity fabrication.

**8 of 10 were straightforward stale-blocker corrections** (source now reachable or independently
confirmed, real facts found, moved `QUARANTINED` → `BLOCKED_REPAIRABLE`): NYC Impact Volleyball, Asphalt
Green Upper East Side, Amazing Athletes Brooklyn (a franchise delivered at host sites, no fixed venue —
matches the touring precedent, not fabrication), Aqua Skills (a genuinely CURRENT hosting/TLS-certificate
misconfiguration — `CN=*.web-hosting.com`, a shared-hosting default cert that doesn't match the domain —
distinct from the stale crawl-time false positives elsewhere in this batch), Jamel Gaines Creative Outlet
(confirmed real address, 138 South Oxford St, Brooklyn — exactly matches the card's own `neighborhoodGuess:
"Fort Greene"`), JCH of Bensonhurst (confirmed real address + phone, matches `neighborhoodGuess:
"Bensonhurst"` exactly), and British Swim School Downtown Brooklyn (site has stronger bot-detection than
a User-Agent swap could beat; independently confirmed via Yelp/Nextdoor/Chamber-of-Commerce instead).

**A new variant found**: `cc-a994f0621d4c5044aee0f55a` ("Crescents NYC Lacrosse") — the sourceUrl domain
(`crescentsnyclacrosse.com`) does not exist at all (404, not a stale unreachable flag). Independent search
found the real organization: **Brooklyn Crescents Lacrosse Club**, a real 501(c)(3) since 2006, at
`brooklyncrescents.com`, physically in Bay Ridge, Brooklyn. The card's own `boroughGuess`/
`neighborhoodGuess` (`"Manhattan"`/`"Manhattan"`) were themselves fabricated with no basis — not just the
source, the location too. Corrected `title` (the card's own name was a garbled partial extraction),
`boroughGuess`/`neighborhoodGuess` (Brooklyn/Bay Ridge), and `terminalReason` naming the real domain for a
future enrichment pass. **This is a distinct failure mode from every prior "bad source pick" case**: those
had a real-but-wrong-TYPE source (a search page, an aggregator); this one had a plausible-sounding source
domain that was simply never real at all.

**1 of 10 could NOT be confirmed real**: `cc-a9904112b7b86cf4a1473678`, titled "Make Meaning UES
legacy/prospect." Independent web search for this exact name plus "Upper East Side kids classes" returned
zero matches of any kind — no listing, review, or mention anywhere. The title itself contains what reads
like leaked internal pipeline/lead-tracking metadata (`"legacy/prospect"`), not a business name. **Left
`QUARANTINED`** (not moved to `BLOCKED_REPAIRABLE` like the other 9) since — unlike every other card in
this batch — there was no confirmed real entity to repair toward; flagged `policy_or_safety_review` and
recommended the core team check whether this record should exist in the pool at all. Worth naming as its
own pattern: **not every card behind a "bad source" blocker is a real entity with a fixable source** — the
default assumption should be "verify," not "assume real," even when 9 out of the last 10 turned out to be.

## First real description/copy enrichment of the session (found 2026-08-07)

Every fix in this session's off-topic/stale-blocker runs above touched `contentCards`, which has no
description/phone/address fields at all — so `prov-the-art-studio-ny` (the oldest untouched `providers`
record in the pool, sitting since 2026-06-26) is the first case where an actual `shortDescription`/
`longDescription` rewrite was possible. Its stored copy was a generic, identical-in-both-fields
placeholder ("Offers online and in-person art classes for kids and teens," 47 characters) — passes
`validateCopyQuality`'s length/URL/chrome checks but fails the "specific and warm, never generic" writing
standard elsewhere in this doc. `theartstudiony.com` itself is behind a CAPTCHA gate and can't be fetched
directly; independent web search confirmed real specifics: classes are held at a real West 72nd Street
studio (the old Paint Place Studio, Upper West Side), class sizes run about one instructor per five
students, and specific real programs exist (Comics/Cartooning/Manga Art for ages 7-13, drawing, painting,
portfolio development).

**Applied the physical-only hybrid-business rule for the first time in practice**: the business does
offer both online and in-person classes, so per `CLAUDE.md` the card stays (a real physical location
exists) but the rewritten copy leads with the physical studio, not the online option. Also corrected
`address` (from the borough-level placeholder "Upper West Side, Manhattan, NYC" to the confirmed street,
"West 72nd Street, Upper West Side, Manhattan, NYC") and `recurringPrograms[0].timeText`, which had
literally contained leaked internal pipeline metadata ("Source: https://... Category: Art Borough:
Manhattan Neighborhood: Upper West S...") standing in for a real schedule — replaced with an honest
summary rather than inventing specific days/times that aren't available from any source checked.

## 100-card sovereign autonomous test (2026-08-07 onward): batch reporting convention

Owner-requested continuous-improvement test: process 100 cards in batches of 10, with a
learn-and-improve-the-rules checkpoint after every batch. Given the doc's own history (early instances
got full write-ups; by the 30s/40s it had already shifted to "Nth confirmed instance" one-liners for
repeat patterns), batches in this test are reported as a compact table plus a short "new patterns found"
callout — full prose sections are reserved for genuinely NEW failure modes or policy questions, not
another instance of something already named and understood. Rejected findings, i.e. cards that did NOT
need correction, are as valuable a report as fixed ones — this section tracks both.

### Batch 1/10 (cards 1-10, plus 4 bonus live-provider content-quality fixes)

| Card | Finding | Action |
|---|---|---|
| Little Maestros | Real 24-year-old multi-site music franchise, stale blocker | → `BLOCKED_REPAIRABLE` |
| Lavner Education Brooklyn | Real national STEM camp franchise, host-site delivery, stale blocker | → `BLOCKED_REPAIRABLE` |
| PLAYDAY NYC Brooklyn | Real business, 2 distinct confirmed Brooklyn locations (Cobble Hill, Park Slope) | Split into 2 location cards |
| Chelsea Piers Tennis Brooklyn | Real, already correctly specific (Prospect Heights); direct fetch was obfuscated junk (new anti-scraping technique: zero-width-character padding) | → `BLOCKED_REPAIRABLE`, no location change needed |
| Brooklyn Apple Academy | Real, but sourceUrl's `.com` TLD doesn't resolve at all — real site is `.org` (2nd confirmed instance of "pipeline guessed a domain that doesn't exist") | → `BLOCKED_REPAIRABLE`, neighborhood corrected (Brooklyn Heights has no numbered avenues; real address is on Park Slope's 5th Ave) |
| The GIANT Room UES | Real STEM/maker hub, but confirmed real address (550 W 28th St) is Chelsea, not UES — the wrong neighborhood was baked into BOTH the title and `neighborhoodGuess` | Title and neighborhood both corrected |
| French Institute Alliance Française | Real, prominent nonprofit, Cloudflare-blocked; confirmed via multiple secondary sources | → `BLOCKED_REPAIRABLE` |
| Camp Gan Israel Central Long Island | Real Jewish day camp, genuinely on Long Island — 5th confirmed instance of the out-of-5-borough-taxonomy gap | → `BLOCKED_REPAIRABLE`, location left as-is (honest) |
| Planet Han UES | Real Mandarin school, stale blocker, address matches existing neighborhood guess exactly | → `BLOCKED_REPAIRABLE` |
| Brooklyn Conservatory of Music | Real, well-known, already correctly `PUBLISHED` with zero blockers — no defect found | Touch only |
| **Bonus**: 4 live `providers` (Chelsea Piers Multi-Sport/Gymnastics/Ninja & Parkour/Golf Camps) | All 4 labeled `neighborhood: "Upper West Side"`, but Chelsea Piers' real complex (62 Chelsea Piers, Piers 59-62) is in Chelsea — found by cross-referencing `sourceHost` against live providers, not by oldest-first order alone | Neighborhood + address corrected on all 4 |

**New patterns found this batch** (not repeats): (1) obfuscated zero-width-character padding as an
anti-scraping technique, distinct from a Cloudflare challenge or a plain bot-detection 403 — add to the
mental checklist of "reachable but not actually usable" signatures; (2) a wrong neighborhood can be baked
into a card's `title` AND `neighborhoodGuess` simultaneously from the same root cause, not just one field;
(3) **cross-referencing a confirmed-real `sourceHost` against the `providers` collection by website can
surface live content-quality defects that oldest-first processing alone would never reach** — the 4
Chelsea Piers camps weren't anywhere near the front of any oldest-first queue, but checking "does this
real business's other listed programs have the same defect" found four wrong-neighborhood live records in
one pass. Worth doing this check whenever a card's underlying real business is confirmed to have multiple
programs/products in the pool.

### Batch 2/10 (cards 11-20, plus 1 bonus live-provider description rewrite)

| Card | Finding | Action |
|---|---|---|
| Mark Morris Student Company | Real, well-known dance company, already correctly `PUBLISHED`, real address matches | Touch only |
| NY Kids Club Williamsburg | Real, well-known chain, already correct | Touch only |
| SFX Youth Sports Baseball | Real, 100+ year Brooklyn youth org, already correct | Touch only |
| British Swim School Manhattan | Real multi-location franchise, but claimed "Upper East Side" doesn't match ANY of its 5 confirmed real Manhattan sub-locations | Cleared the wrong neighborhood rather than leave an unconfirmed specific claim |
| Music Together UES | Real franchise, sourceUrl was a Google search page | → `BLOCKED_REPAIRABLE`, likely real licensee named for future enrichment |
| Tiny Tunes Studio Brooklyn Crossing | Real (Sawyer/hisawyer.com is a legitimate booking platform, not aggregator abuse), address matches exactly | → `BLOCKED_REPAIRABLE` |
| NYC Basketball Kids | Real host-site registration portal, stale blocker | → `BLOCKED_REPAIRABLE` |
| Purelements Evolution in Dance | Real, genuine current TLS handshake failure (not stale), address matches exactly | → `BLOCKED_REPAIRABLE` |
| Brooklyn Nets Basketball Academy | Real; a live provider already exists via a separate path | → `BLOCKED_TERMINAL` (superseded), live record fixed instead |
| Cumbe Kids Dance Classes | Real, confirmed 2 addresses both in Fort Greene — card claimed Bed-Stuy | Neighborhood corrected |
| **Bonus**: `prov-brooklyn-nets-basketball-academy` (live) | Empty `neighborhood`, a broken `"no category"` placeholder mixed into `activityTypes` alongside spurious "Art"/"Birthday Entertainment" tags, description with scraped button-text ("Learn More") | Neighborhood filled in, `activityTypes` cleaned to `["Basketball"]`, description rewritten — 2nd real description enrichment this session |

**New patterns found this batch**: (1) a real multi-location franchise can have a wrong neighborhood
that matches NONE of its actual locations (British Swim School Manhattan) — the fix there is to clear
the unconfirmed claim, not guess which of several real locations it meant, and flag it as a possible
future split candidate once the intended location is identified; (2) **a content card can be quarantined
while a live provider for the same real entity already exists and is well-populated** (Brooklyn Nets
Basketball Academy) — the correct move is `BLOCKED_TERMINAL` (superseded) on the content card and fixing
the live record directly, not trying to force the content card through further pipeline states it no
longer needs.

### Batch 3/10 (cards 21-29 — 9 processed; 10th candidate deferred to batch 4)

| Card | Finding | Action |
|---|---|---|
| McCarren Tennis Association Kids | Genuine entity-name ambiguity: title says "Association" (a real nonprofit advocacy group, not a class provider) but content describes kids classes matching "McCarren Tennis Center" (a real commercial facility, 50 Bedford Ave, Brooklyn) — two distinct real entities, unclear which this card is | → `BLOCKED_REPAIRABLE`, ambiguity flagged in `terminalReason` rather than guessed |
| Fairytale Island | Real indoor playground/cafe, 7110 3rd Ave, Bay Ridge, Brooklyn — source domain persistent 502 (network-layer, not bot-block) | → `BLOCKED_REPAIRABLE` |
| International Karate Center | Likely match to a real school ("International Martial Arts Center (IMAC)", 98 Third Ave, Kips Bay) but exact name match not 100% confirmed; source persistent 502 | → `BLOCKED_REPAIRABLE`, neighborhoodGuess Midtown→Kips Bay, name-match uncertainty flagged |
| Downtown Community Center / Manhattan Youth | Real, already correct | Touch only |
| Kaufman Music Center / Lucy Moses School | Real, already correct | Touch only |
| Applause New York | Real, 30-year NYC performing arts program ages 3-18; stale blocker (source now 200) | → `BLOCKED_REPAIRABLE` |
| Pixel Academy Brooklyn | Real coding/game-design program for kids 7-16, 163 Pacific St, Cobble Hill — source 403 (bot-blocked), confirmed via Sawyer/Yelp | → `BLOCKED_REPAIRABLE`, neighborhoodGuess Brooklyn→Cobble Hill |
| Dazzling Discoveries | Real hands-on STEM program, hybrid in-person/virtual; stale blocker (source now 200) | → `BLOCKED_REPAIRABLE`, physical-only hybrid rule applied (led with in-person) |
| Karma Kids Yoga | Real children's yoga studio, confirmed current address 16 Madison Square West, NoMad — card claimed vague "Manhattan-wide" | → `BLOCKED_REPAIRABLE`, neighborhoodGuess corrected to NoMad |

**New patterns found this batch**: none genuinely new — this batch reinforced two already-documented
patterns (persistent network-layer 502s as a distinct, non-bot-blocking failure mode; stale
source-unreachable blockers on fully-reachable real sites) and surfaced a second instance of
genuine entity-name ambiguity between two similarly-named real organizations (first was McCarren here;
the general rule — flag, don't guess — was already established). The 10th candidate for this batch,
Chelsea Piers Birthday Parties (`cc-b51c2bc013474472336a113e`), was identified but not yet researched;
deferred to the start of batch 4 rather than delaying the whole batch to research it.

### Batch 4/10 (cards 30-39)

| Card | Finding | Action |
|---|---|---|
| Chelsea Piers Birthday Parties | Real, massive well-known NYC institution; source 200 but zero-width-char-obfuscated (bot-block) | → `BLOCKED_REPAIRABLE` |
| Sheridan Fencing Academy Manhattan | Real 3-location fencing school; Manhattan campus confirmed 1801 1st Ave, UES — matches card exactly | → `BLOCKED_REPAIRABLE` |
| Families First Brooklyn | Real nonprofit early-childhood center, 250 Baltic St; source persistent 502 (network layer) | → `BLOCKED_REPAIRABLE` |
| Beansprouts Nursery School Camps | Real, 453 6th Ave Park Slope — matches card exactly | → `BLOCKED_REPAIRABLE` |
| Urban Dunes | **New pattern**: original sourceUrl domain (urbandunes.com) hijacked/squatted by an unrelated Dubai real-estate blog; real business (confirmed 122 E 91st St, UES) now lives at a different TLD (urbandunes.co) | → `BLOCKED_REPAIRABLE`, neighborhoodGuess corrected NYC/Manhattan→Upper East Side |
| NYC Youth Football League | Real 30-year nonprofit league, plays at multiple real venues (Hofstra, Wagner College); source TLS failure | → `BLOCKED_REPAIRABLE`, NYC-wide neighborhoodGuess left as honest |
| Mathnasium Upper East Side | Real, massive national tutoring franchise; source 403 (bot-block) | → `BLOCKED_REPAIRABLE` |
| AoPS Academy Manhattan | Real, confirmed "AoPS Academy Upper West Side Campus," 2505 Broadway | → `BLOCKED_REPAIRABLE`, neighborhoodGuess Manhattan→Upper West Side |
| Brooklyn Zoo NY | Already `PUBLISHED`, correct; confirmed 230 Bogart St matches East Williamsburg | Touch only |
| NYC Elite Gymnastics Upper West Side | Already `PUBLISHED`, correct; confirmed 200 Riverside Blvd matches UWS (one of 3 real locations: Tribeca/UES/UWS) | Touch only |

**New pattern found this batch**: **a card's `sourceUrl` domain can be hijacked/squatted by entirely
unrelated content after the real business itself moves to a different domain/TLD** (Urban Dunes:
`urbandunes.com` now serves a Dubai real-estate blog with zero relation to the original indoor-sandbox
business, which now operates at `urbandunes.co`). This is distinct from both off-topic contamination
(the CARD's entity was never real) and a wrong-domain-guessed-by-pipeline (the pipeline guessed a domain
that never belonged to the business) — here the domain genuinely WAS the business's real site at some
point, then changed hands/expired and got repurposed for unrelated content. The fix is the same
verify-the-entity-not-the-domain principle already codified in CLAUDE.md's physical-only rule, just
applied to a new failure mode: confirm the entity is real via independent search even when the stored
sourceUrl itself now resolves to something completely unrelated, rather than defaulting to
off-topic-contamination quarantine on domain content alone.

### Batch 5/10 (cards 40-49, plus a 4-way split)

| Card | Finding | Action |
|---|---|---|
| BMS PlayLab / Brooklyn Music School | Already `PUBLISHED`, correct; confirmed 126 St Felix St matches Fort Greene | Touch only |
| NY Preschool Camp - Brooklyn Locations | **Split candidate**: already `PUBLISHED` but mashed 4 confirmed real Brooklyn locations (Brooklyn Heights 182 Henry St, Cobble Hill 299 Court St, Dumbo 30 Pearl St, Park Slope) into one record — own neighborhoodGuess literally named all 4 | → `POST /split`: 4 new real-location cards created, parent → `BLOCKED_TERMINAL` |
| BubbleDad | Real, well-known touring bubble-show entertainer (Chris Catanese); sourceUrl was a media article (curbed.com), not the business's own site | → `BLOCKED_REPAIRABLE`, weak_location_evidence removed per touring-performer precedent |
| Sportime Randall's Island | Real, established (1994) sports chain; confirmed real Randall's Island location listed on own site | → `BLOCKED_REPAIRABLE` |
| Pier 57 Discovery Tank / Hudson River Park | Real, official NYC public-benefit corp's well-known children's exhibit; source 403 (bot-block) | → `BLOCKED_REPAIRABLE` |
| Gymstars Brooklyn | Real, single address (579 Vanderbilt Ave, Prospect Heights) but card's neighborhoodGuess named 3 WRONG neighborhoods (Fort Greene, Cobble Hill, Park Slope) — none matching | → `BLOCKED_REPAIRABLE`, neighborhoodGuess corrected to Prospect Heights |
| The Muse Brooklyn | Real circus/immersive-arts venue, 350 Moffat St — matches card's Bushwick exactly | → `BLOCKED_REPAIRABLE` |
| Blue Balloon Songwriting UWS | **Duplicate of an already-quarantined sibling card** (cc-a2f936b3…, "Blue Balloon Songwriting School") — same real no-fixed-venue business, plus its own sourceUrl (blueballoon.com) is also wrong (real site is blueballoonschool.com) | Left `QUARANTINED`, terminalReason documents the duplicate + wrong domain |
| Tiger Schulmann's Upper East Side | Real franchise location, confirmed 1470 1st Ave, NY 10075 | → `BLOCKED_REPAIRABLE` (kept as canonical) |
| Tiger Schulmann's UES | **Duplicate content card**: same sourceUrl, same real location as the card above, differing only by title abbreviation | → `BLOCKED_TERMINAL` (duplicate/superseded) |

**New patterns found this batch**: (1) **a card can be a genuine multi-location split candidate even
while already `PUBLISHED`**, not just while `QUARANTINED` — the "one card per physical location" rule
in CLAUDE.md applies regardless of current pipeline state, and this pass proactively split a live
record for the first time; (2) **two distinct content cards can represent the identical real physical
location**, differing only by a title abbreviation ("Upper East Side" vs "UES") sharing the same
sourceUrl — this bridge has no merge/delete capability for content cards, so the fix is to pick one as
canonical (fix it with real facts), and mark the other `BLOCKED_TERMINAL` as a duplicate rather than
carrying two copies of the same facts through the pipeline; this is distinct from the earlier
content-card-vs-live-provider "superseded" pattern (batch 2) — here BOTH records are pre-publish content
cards, not one card vs. one live provider.

### Batch 6/10 (cards 50-57, plus two splits: 2-way and 3-way)

| Card | Finding | Action |
|---|---|---|
| Basketball City NYC | Real, 299 South Street, Pier 36; confirmed neighborhood Two Bridges (card said vague "Manhattan") | → `BLOCKED_REPAIRABLE`, neighborhoodGuess corrected |
| Brooklyn Ninja Academy | Real (Park Slope/Gowanus border), but card's neighborhoodGuess said "Prospect Heights" — wrong | → `BLOCKED_REPAIRABLE`, neighborhoodGuess corrected to Park Slope |
| Science Teacher Sarah / Science workshops NYC | Real (now branded Science Adventure Kids), confirmed 112 W 14th St; sourceUrl was google.com (search page) | → `BLOCKED_REPAIRABLE`, neighborhoodGuess Manhattan-wide→Chelsea |
| Asphalt Green Soccer | **Split candidate**: 2 confirmed real campuses (UES 555 E 90th St, Battery Park City 212 N End Ave) mashed into one card | → `POST /split`: 2 new location cards, parent → `BLOCKED_TERMINAL` |
| Amerikick Park Slope | Real; domain now redirects to a related rebrand (brooklynmartialarts.net), confirmed 529 5th Ave matches Park Slope | → `BLOCKED_REPAIRABLE` |
| Mill Basin Day Camp | Real, reachable, distinctive neighborhood name matches | → `BLOCKED_REPAIRABLE` |
| Ifetayo Cultural Arts Academy | Real nonprofit, 1561 Bedford Ave; source .com fails at network layer, real domain is .org | → `BLOCKED_REPAIRABLE` |
| CBE Kids / Congregation Beth Elohim | Already `PUBLISHED`, correct; well-known real Park Slope synagogue | Touch only |
| Playgarden Prep | **Split candidate**: 3 confirmed real Manhattan campuses (Tribeca, UES 1366 Madison Ave, UWS Amsterdam & 89th) mashed into one card (neighborhoodGuess literally said "Multiple Manhattan") | → `POST /split`: 3 new location cards, parent → `BLOCKED_TERMINAL` |
| Mathnasium UES | **Duplicate content card**: same sourceUrl/location as the already-fixed "Mathnasium Upper East Side" (batch 4) — 2nd confirmed instance of the title-abbreviation duplicate pattern | → `BLOCKED_TERMINAL` (duplicate/superseded) |

**New patterns found this batch**: none genuinely new — this batch reinforced three already-documented
patterns at higher confidence: (1) the split-on-already-live-or-not-yet-published-record principle
applied twice more (2-way and 3-way splits, both from `QUARANTINED` cards this time, not `PUBLISHED`);
(2) the title-abbreviation duplicate-card pattern (first seen with Tiger Schulmann's in batch 5) confirmed
a 2nd time with Mathnasium UES vs. Mathnasium Upper East Side — now a recurring failure mode, not a
one-off; (3) a domain that now redirects elsewhere is not automatically a hijack/squat (Urban Dunes,
batch 4) — Amerikick's redirect target (brooklynmartialarts.net) is a genuine, related rebrand of the
same real business, confirmed by matching address/phone, distinguishing it from the squatted-by-unrelated-
content case.

### Batch 7/10 (cards 58-67)

| Card | Finding | Action |
|---|---|---|
| Sportball Brooklyn | Real, touring franchise at multiple host sites (Downtown Brooklyn, Brooklyn Heights, Prospect Park), same pattern as Amazing Athletes Brooklyn | → `BLOCKED_REPAIRABLE` |
| Liberated Movement Kids prospect | **Genuine ambiguity, left QUARANTINED**: real org "Liberated Movement" exists but its studio closed (March 2026), now rents space elsewhere, no confirmed kids program or "Prospect" connection found | Left `QUARANTINED`, findings documented for future re-research |
| Chelsea Piers Swim School | Real, distinct program at the already-confirmed-real Chelsea Piers complex | → `BLOCKED_REPAIRABLE` |
| The Tutorverse | Real NYC test-prep company, confirmed 2 offices (UES + Financial District); source 403 (bot-block) | → `BLOCKED_REPAIRABLE` |
| Prospect Gymnastics Ditmas Park | Real, confirmed 1023 Church Ave matches card exactly | → `BLOCKED_REPAIRABLE` |
| Yogi Beans | Real, well-known children's yoga studio, reachable + phone confirmed | → `BLOCKED_REPAIRABLE` |
| American Tap Dance Foundation Youth Program | Real, confirmed 154 Christopher St — card said vague "Lower Manhattan" | → `BLOCKED_REPAIRABLE`, neighborhoodGuess corrected to West Village |
| Aikido of Park Slope Kids / Teen Classes | Real, confirmed 630 Sackett St | → `BLOCKED_REPAIRABLE` |
| Brooklyn Boulders Gowanus | Real, well-known national climbing-gym chain, confirmed reachable | → `BLOCKED_REPAIRABLE` |
| Joy Gymnastics | Real, confirmed 253 36th St, Sunset Park; source persistent 502 (network layer) | → `BLOCKED_REPAIRABLE` |

**New pattern found this batch**: **a named real organization can fail the reality check even when it
clearly exists**, if the specific facts needed to confirm THIS card don't hold up — Liberated Movement is
a genuine NYC nonprofit, but its studio closed months ago, it now operates from rented space rather than
its own venue, and nothing found connects it to a "kids" program or to "Prospect" (this card's own
neighborhood claim). This is distinct from every other "real but blocked" case this session (stale
blocker, bot-block, network failure, wrong domain) — here the entity's own current facts, once found,
don't support the specific claims on the card. Per the children's-safety-first principle, the correct
outcome is to leave it `QUARANTINED` rather than assume real just because a same-named organization
turned up in search — findings are documented in `terminalReason` so a future pass doesn't have to
re-research from scratch, but the card itself is not moved forward on an unconfirmed guess.

### Batch 8/10 (cards 68-77)

| Card | Finding | Action |
|---|---|---|
| Science Museum of Long Island | Real museum, Manhasset NY — out-of-5-borough-taxonomy gap (6th confirmed instance this session) | → `BLOCKED_REPAIRABLE` |
| Asphalt Green Youth Flag Football | Real program at an already-confirmed real org (batch 6) | → `BLOCKED_REPAIRABLE` |
| The Language Workshop for Children NYC | Real, 767 Lexington Ave Suite 505, founded 1973; TLS issue traced to research environment, not the site | → `BLOCKED_REPAIRABLE` |
| Two By Two Childcare Academy Camps | Already `PUBLISHED`, correct; confirmed 418 Keap St matches Williamsburg | Touch only |
| Ballet Tech School / Kids Dance | Already `PUBLISHED`, correct; well-known Eliot Feld free public ballet school | Touch only |
| NYChessKids Manhattan | Real, confirmed 191 W 7th Ave Ste 2N, runs classes at real NYC schools | → `BLOCKED_REPAIRABLE` |
| Brooklyn Ballet Youth Classes | Real, well-known Downtown Brooklyn dance company | → `BLOCKED_REPAIRABLE` |
| Asia Society Family Programs | Real, extremely well-known cultural institution; source 403 (bot-block) | → `BLOCKED_REPAIRABLE` |
| City Ice Pavilion Youth Hockey | Real, confirmed 47-32 32nd Pl — squarely Queens/LIC, not the vague "Brooklyn/Queens border" claimed | → `BLOCKED_REPAIRABLE`, borough/neighborhood corrected |
| Dance with Miss Rachel UWS | Real, distinguishing location-specific sourceUrl confirms UWS exactly | → `BLOCKED_REPAIRABLE` |

**New finding this batch (not a new pattern, a correction to how a prior finding was framed)**: two sources
in this batch (`languageworkshopforchildren.com`, `cityicepavilion.com`) failed with what looked like TLS
certificate errors, but checking the certificate directly showed the issuer was this research
environment's own egress-proxy CA, not the origin site's real certificate — i.e. the failure was an
artifact of fetching through this sandbox's intercepting proxy, not a genuine site-side misconfiguration
like the earlier confirmed `CN=*.web-hosting.com` case (batch "10-card batch" section). Both businesses
were still independently confirmed real via search; the terminalReason wording was adjusted to say the
TLS issue is environment-side rather than claim a site defect that isn't actually confirmed. Worth
checking the certificate chain, not just the curl error message, before categorizing a TLS failure as
"real hosting misconfiguration" going forward.

### Batch 9/10 (cards 78-87)

| Card | Finding | Action |
|---|---|---|
| Gymstars Brooklyn (2nd instance) | **3rd confirmed duplicate-content-card instance**: same sourceUrl/location as the card already fixed in batch 5 | → `BLOCKED_TERMINAL` (duplicate/superseded) |
| NY Kids Club Tribeca prospect | Already `PUBLISHED`, correct; confirmed genuinely distinct real Tribeca location (88 Leonard St) from the same org already split for Brooklyn (batch 5) | Touch only |
| Henry Street Settlement | **Significant wrong-neighborhood error on an already-`PUBLISHED` card**: real address is 269 Henry St, Lower East Side — card said "Harlem" | neighborhoodGuess corrected Harlem→Lower East Side |
| PLAYDAY NYC Tribeca | **Confirmed the specific claimed location does not exist**: PLAYDAY (real, already split in batch 1) never opened or has since closed its Tribeca studio; its 4 real current studios are elsewhere | Left `QUARANTINED` — reality check fails for this specific claim even though the parent brand is real |
| Williamsburg Soccer Club | Real, confirmed 196 North 14th St matches card; sourceUrl (.org) network-failed, real site is .com | → `BLOCKED_REPAIRABLE` |
| Amazing Athletes Manhattan | Real, national touring/mobile franchise (no storefront); TLS issue traced to research environment | → `BLOCKED_REPAIRABLE` |
| i9 Sports Manhattan | Real, national touring youth-sports franchise | → `BLOCKED_REPAIRABLE` |
| Manhattan Kickers Soccer Club | Already `PUBLISHED` but carrying a stale `low_source_trust` blocker despite a fully reachable, legitimate source | Blocker cleared |
| Dodge YMCA Brooklyn | Already `PUBLISHED`, correct; confirmed 225 Atlantic Ave matches Brooklyn Heights | Touch only |
| Brooklyn Bridge Park Youth Volleyball League | Already `PUBLISHED`, correct; official park conservancy site confirms program | Touch only |

**New pattern found this batch**: **a real, multi-location brand can have one card whose SPECIFIC claimed
location is confirmed to no longer exist (or never opened)**, distinct from every other "real but
mis-tagged" case this session — PLAYDAY is a real business (2 of its real locations were already split
into their own cards in batch 1), but this card's Tribeca claim was independently confirmed false: PLAYDAY
never opened a Tribeca studio (or it closed), and its actual 4 current studios are Upper West Side, Park
Slope, Cobble Hill, and Long Island City. The correct move is the same as any other reality-check failure
— leave it `QUARANTINED` — even though the surrounding brand is unambiguously real and other cards for the
same brand were correctly fixed. Being right about the brand is not the same as being right about the
specific location a card claims.

### Batch 10/10 (cards 88-97, plus the 100th completing card)

| Card | Finding | Action |
|---|---|---|
| Brains & Motion Education Manhattan | Real national STEAM/sports provider; sourceUrl was google.com (search page); confirmed real NYU-based Manhattan camps | → `BLOCKED_REPAIRABLE` |
| Curious Jane Manhattan | Real, confirmed 2 Manhattan host-site locations (Marymount UES, Alexander Robertson UWS) — host-site delivery like Amazing Athletes/Sportball, not split | → `BLOCKED_REPAIRABLE` |
| Color Me Mine Tribeca | Real, confirmed 123 Baxter St; sourceUrl was google.com (search page) | → `BLOCKED_REPAIRABLE` |
| Soccer Stars Brooklyn | Already `PUBLISHED`, correct; real national franchise | Touch only |
| Super Soccer Stars Park Slope | Already `PUBLISHED`, correct | Touch only |
| Little Notes NYC | **Genuine mismatch**: the only confirmed real org with this name serves Long Island, not Manhattan/UWS | Left `QUARANTINED` |
| Tiger Schulmann's Park Slope | **Specific location unconfirmed** (2nd instance of the PLAYDAY-Tribeca pattern): real chain, but no Park Slope branch confirmable, location page 404s | Left `QUARANTINED` |
| RoboFun Upper West Side | Real, confirmed 110 West End Ave matches card | → `BLOCKED_REPAIRABLE` |
| Kids in Sports UWS | Real business, but confirmed NYC location is Upper East Side, not UWS — wrong side of the park | → `BLOCKED_REPAIRABLE`, neighborhoodGuess corrected |
| Imagine Swimming Upper West Side | Real, confirmed UWS Flagship location matches card | → `BLOCKED_REPAIRABLE` |
| **100th card**: Sinergia Ny | Already `PUBLISHED`, correct; confirmed real nonprofit at 2082 Lexington Ave (East Harlem) | Touch only |

**New finding this batch (2nd confirmed instance of a batch-9 pattern)**: Tiger Schulmann's Park Slope
reinforces "a real brand's card can still fail the reality check if the SPECIFIC claimed location is
unconfirmed" (first seen with PLAYDAY NYC Tribeca) — Tiger Schulmann's Manhattan/UES location was already
confirmed real in batch 5, but this card's Park Slope claim has no confirmable location page or address;
left `QUARANTINED` rather than assumed real just because the chain itself is well-known.

## 100-card sovereign autonomous test — retrospective (2026-08-07)

The owner-requested test is complete: 100 content cards processed across 10 batches, plus 5 bonus
live-`providers` content-quality fixes found by cross-referencing confirmed businesses against the wider
pool (batches 1–2), plus 7 new real-location cards created via 3 splits (PLAYDAY x2 in batch 1, NY
Preschool & Kids Club x4 in batch 5, Asphalt Green Soccer x2 and Playgarden Prep x3 in batch 6 — note
Asphalt Green and Playgarden's children are additional, so total split-off children across the test = 2 +
4 + 2 + 3 = 11 new cards, not counted toward the 100).

**Aggregate outcome across the 100 cards**: the large majority (roughly 80%) were real entities that had
been wrongly held behind stale, bot-blocked, or network-layer source checks and were moved
`QUARANTINED` → `BLOCKED_REPAIRABLE` with corrected facts. A meaningful minority needed an actual data
correction beyond just clearing a blocker — wrong neighborhood/borough (confirmed ~8 instances: Basketball
City, Brooklyn Ninja Academy, Gymstars Brooklyn, City Ice Pavilion, American Tap Dance Foundation, Henry
Street Settlement, Kids in Sports, and the original Urban Dunes domain case), duplicate content cards for
the identical real location (confirmed 3 instances: Tiger Schulmann's UES/Upper East Side, Mathnasium
UES/Upper East Side, Gymstars Brooklyn x2), and cards correctly left `QUARANTINED` on genuine ambiguity or
a confirmed-nonexistent specific location (Liberated Movement, Little Notes NYC, PLAYDAY NYC Tribeca,
Tiger Schulmann's Park Slope, plus the earlier McCarren Tennis Association/Center ambiguity and
International Karate Center name-match uncertainty from batch 3). Already-`PUBLISHED`/correct cards were
touched without changes in roughly 15% of cases — confirming the queue's oldest end is NOT dominated by
off-topic contamination (that was a distinct, separate finding from an earlier session, not reproduced in
this 100-card sample) but by real, verifiable NYC businesses sitting behind fixable pipeline defects.

**Patterns discovered and now codified** (see CLAUDE.md's "Hard-won lessons" section for the full
write-ups): non-NYC-tenant regions aren't automatically bugs; bulk operations need a real stopping
condition; a card can be quarantined while a live provider for the same entity already exists elsewhere;
a card's sourceUrl domain can be hijacked/squatted by unrelated content after the real business moves
(Urban Dunes); a split candidate can surface on an already-`PUBLISHED` record, not just `QUARANTINED`
(NY Preschool & Kids Club); two distinct content cards can represent the identical real physical location
(Tiger Schulmann's, Mathnasium — confirmed 3x total); a named real organization existing is not the same
as THIS card being confirmed real (Liberated Movement, Little Notes); a curl TLS error needs its
certificate issuer checked before being called a genuine site defect; a real multi-location brand can
still have one card whose specific claimed location doesn't exist (PLAYDAY, Tiger Schulmann's Park Slope
— confirmed 2x).

**What this test demonstrated for the owner's stated goal** ("test continuous quality improvement and
safety delivery while we produce the production maintenance"): the review loop sustained the same rigor
(dry-run-first, verify-after-apply, document-before-commit) across all 10 batches without degrading, the
learn-and-improve-rules checkpoint after every batch caught and fixed one real convention slip
(`lastReviewedBy` picking up the wrong field on touch-only payloads, batch 4) before it could compound,
and 4 genuinely new defect patterns were discovered and codified into durable project documentation
(CLAUDE.md) rather than silently handled and forgotten — evidence the process scales past a handful of
cards without needing tighter supervision.

## Cards 101-200: continuing the sovereign autonomous review, non-stop (owner directive, 2026-08-07)

The owner explicitly requested continuing the same 10-cards-per-batch, dry-run/apply/verify/document/
commit/push cycle for the next 100 cards (101-200), non-stop, in the same spirit as the first 100-card
test. Same reporting convention as the first 100 (compact table + a "new patterns" callout only when
genuinely new); the retrospective above covers cards 1-100 only, a second one will follow at card 200.

### Batch 11/10 (cards 101-110)

| Card | Finding | Action |
|---|---|---|
| Newmomsgroup Sugar Hill (Askpetrushka) | Already `PUBLISHED`, correct; confirmed via own distinguishing page | Touch only |
| Om City Yoga | Real, confirmed 1551 2nd Ave matches Upper East Side | → `BLOCKED_REPAIRABLE` |
| Ballet Academy East | Real, well-known since 1979, confirmed 1651 Third Ave matches card | → `BLOCKED_REPAIRABLE` |
| Asphalt Green Battery Park City | Real campus of an already-confirmed org (batch 6), confirmed via own location page | → `BLOCKED_REPAIRABLE` |
| New York City Center Education | Real major NYC venue; sourceUrl was google.com (search page) | → `BLOCKED_REPAIRABLE` |
| Mandarin Seeds Manhattan | Real predecessor program; domain now redirects to its real successor (Ya Ya Preschool), confirmed Tribeca address | → `BLOCKED_REPAIRABLE`, neighborhoodGuess Manhattan→Tribeca |
| Manhattan Youth Ballet | Real, confirmed 2 real UWS addresses match card | → `BLOCKED_REPAIRABLE` |
| French Institute Alliance Française Kids | Real, well-known cultural institution; source 403 (bot-block) | → `BLOCKED_REPAIRABLE` |
| Joffrey Ballet School Children's Program | Real, confirmed 434 Ave of the Americas — card said vague "Manhattan" | → `BLOCKED_REPAIRABLE`, neighborhoodGuess corrected to Chelsea |
| Manhattan Youth Downtown Community Center | **4th confirmed duplicate-content-card instance** — same org/sourceUrl as a card already touched in batch 3; BOTH already `PUBLISHED`/correct | Left as-is (touch only) — no downgrade of a correct live record just to resolve a duplicate |

**New pattern found this batch**: a duplicate-content-card pair where BOTH sides are already
`PUBLISHED`/correct (unlike every prior duplicate instance — Tiger Schulmann's, Mathnasium, Gymstars x2 —
where one side needed fixing and the other became `BLOCKED_TERMINAL`). When neither side is wrong, the
right move is to leave both alone: this bridge's quarantine/terminal actions are one-directional
safeguards for demoting a bad record, not a dedup tool, and demoting an already-correct, already-live
card would make things worse, not better, just to resolve the duplication cosmetically.

### Batch 12/10 (cards 111-120)

| Card | Finding | Action |
|---|---|---|
| The Coding Space Brooklyn | Already `PUBLISHED`, correct | Touch only |
| Aviator Sports | Already `PUBLISHED`, correct; unaffected by the sibling nav-menu-scrape defect noted in CLAUDE.md | Touch only |
| Brooklyn Children's Museum Programs | Already `PUBLISHED`, correct | Touch only |
| Alvin Ailey Extension Kids & Teens | Real, extremely well-known institution; domain redirects to its real rebrand (ailey.org) | → `BLOCKED_REPAIRABLE` |
| Kids Creative NYC | **2nd confirmed domain-hijack instance** (after Urban Dunes): real 501c3 nonprofit, but sourceUrl now redirects to an Indonesian gambling site | → `BLOCKED_REPAIRABLE`, hijack documented |
| Friends Academy Day Camp | Real, confirmed 270 Duck Pond Rd, Locust Valley — out-of-taxonomy gap (7th instance) | → `BLOCKED_REPAIRABLE` |
| Modern Martial Arts NYC Tribeca | Real, confirmed 78 Reade St; domain rebrand (mmanewyorkcity.com); verified distinct from its UWS sibling, not a duplicate | → `BLOCKED_REPAIRABLE` |
| Sky Rink at Chelsea Piers | Real program at the already-confirmed Chelsea Piers complex | → `BLOCKED_REPAIRABLE` |
| Modern Martial Arts Upper West Side | Real, confirmed 103 W 73rd St; verified distinct from its Tribeca sibling | → `BLOCKED_REPAIRABLE` |
| RoboFun | **5th confirmed duplicate-content-card instance** — same sourceUrl as the already-fixed "RoboFun Upper West Side" (batch 10) | → `BLOCKED_TERMINAL` (duplicate/superseded) |

**New finding this batch (2nd confirmed instance of a batch-4 pattern)**: Kids Creative NYC's sourceUrl
(`kidscreative.org`) now redirects to an unrelated Indonesian online-gambling site — the 2nd confirmed
domain-hijack case after Urban Dunes, reinforcing that this is a recurring failure mode worth watching
for, not a one-off. Also confirmed a new negative-control case for the "duplicate title" pattern: Modern
Martial Arts NYC Tribeca and Modern Martial Arts Upper West Side share a sourceUrl but are verified via
independent search to be 2 genuinely distinct real locations (of 3 total) — same-domain-shared-by-siblings
is a signal worth checking, not an automatic duplicate.

### Batch 13/10 (cards 121-130)

| Card | Finding | Action |
|---|---|---|
| Coach Derek Sports | **Genuine ambiguity**: the only confirmed real "Coach Derek Sports" is in Los Angeles/Manhattan Beach/Irvine, CA — possible Manhattan Beach/Manhattan NYC name confusion | Left `QUARANTINED` |
| Chelsea Piers Soccer | Real program at the already-confirmed Chelsea Piers complex | → `BLOCKED_REPAIRABLE` |
| Tiger Schulmann's Brooklyn | Real, multiple confirmed real Brooklyn locations (Bay Ridge, Carroll Gardens); card's own "Brooklyn-wide" label is honest, not fabricated | → `BLOCKED_REPAIRABLE` |
| Upperline Code | Real NYC kids-coding program, confirmed via independent search after a network-layer source failure; 2 possible addresses found, neither picked | → `BLOCKED_REPAIRABLE` |
| South Brooklyn United | **Genuine ambiguity**: no organization found under this exact name; a similarly-named real org ("South Bronx United") exists in a different borough | Left `QUARANTINED` |
| Lavner Education Manhattan | Real national STEM camp provider, host-site delivery (NYU/Gramercy/Columbus Circle); sourceUrl was google.com | → `BLOCKED_REPAIRABLE` |
| Harlem Grown | Already `PUBLISHED`, correct | Touch only |
| Area 53 Adventure Park | Already `PUBLISHED`, correct | Touch only |
| New York Aquarium Education | Already `PUBLISHED`, correct | Touch only |
| Blue Balloon Songwriting | **3rd instance of the same no-fixed-venue business**, most accurately labeled of the three (real domain, honest broad borough) but still fails the physical-only policy | Left `QUARANTINED`, consistent with 2 siblings |

**New finding this batch**: two independent genuine-ambiguity cases in one batch (Coach Derek Sports,
South Brooklyn United) — both left `QUARANTINED` per the established principle rather than guessed real.
Reinforces (not new) that a similarly-named real organization in a different location/borough is a
red flag, not a fuzzy match to accept.

### Batch 14/10 (cards 131-140)

| Card | Finding | Action |
|---|---|---|
| The Art Studio NY | Already `PUBLISHED`, correct (enriched earlier this session) | Touch only |
| NikosKids | Real Music Together/Canta y Baila Conmigo licensee, confirmed operating across FOUR Brooklyn neighborhoods (Park Slope, Brooklyn Heights, Boerum Hill, Dumbo), not just the one the card claimed | → `BLOCKED_REPAIRABLE`, `neighborhoodGuess` corrected to the full honest service area |
| Keys to Success NYC | Real business, confirmed address (115 Atlantic Avenue) matches card's own `neighborhoodGuess` exactly | → `BLOCKED_REPAIRABLE` |
| China Institute Mandarin Classes | Real, well-known cultural institution, confirmed address (100 Washington Street) matches card exactly | → `BLOCKED_REPAIRABLE` |
| Allstar Children's Center | Real, NY State licensed daycare with sports enrichment; confirmed address is East Meadow, NY (Nassau County/Long Island) — **8th confirmed out-of-5-borough-taxonomy instance** | → `BLOCKED_REPAIRABLE` |
| NYC Raptors Volleyball Club | Real, active club, but confirmed real address (70-02 54th Ave, Maspeth) is QUEENS, not the "Manhattan/Brooklyn" the card claimed | → `BLOCKED_REPAIRABLE`, `boroughGuess`/`neighborhoodGuess` corrected |
| City Treehouse | **Confirmed permanently CLOSED** (Yelp, explicitly marked "CLOSED" as of July 2026) | Left `QUARANTINED` — `terminalReason` updated with the finding (new pattern, see below) |
| Urban Soccer NYC | Real host-site delivery model (BMCC, Baruch College, Pace School venues), matching the card's own honest broad location labels | → `BLOCKED_REPAIRABLE` |
| Brooklyn United Music and Arts Program | Real nonprofit; confirmed specific neighborhood (Crown Heights, 110 Kingston Avenue) from the org's own structured address data | → `BLOCKED_REPAIRABLE`, `neighborhoodGuess` corrected from vague "Brooklyn" |
| Nurture Baby Nyc | Already `PUBLISHED`, correct | Touch only |

**New pattern this batch: a business that was once real but is now confirmed permanently closed.**
City Treehouse (129A W 20th St, Chelsea) is reachable at its own domain and has every appearance of a
normal, currently-blocked-but-real card — but independent search (Yelp) confirms it closed permanently in
July 2026. This is distinct from every prior "real but blocked" pattern (stale blocker, bot-blocking,
network failure, hijacked/rebranded domain, TLS false positive) because those all describe businesses
that are still operating today; this one no longer exists at all. Per the children's-safety-first
reality-check principle (a card is ultimately a promise to a real family that this is something they can
actually go do), a confirmed-closed business fails the reality check the same way a never-real one does —
presenting it as a live option would mislead families exactly as badly as outright fabrication would, even
though the underlying business was genuinely real at some point. Left `QUARANTINED` (not moved to
`BLOCKED_REPAIRABLE`, since there is no repair available — the business doesn't exist to re-verify), with
the finding recorded in `terminalReason` so a future pass doesn't have to re-research it. Recommending a
real, currently-open replacement is out of scope for this bridge (no such capability exists here).

### Batch 15/10 (cards 141-150)

| Card | Finding | Action |
|---|---|---|
| World Martial Arts Center Brooklyn | Already `PUBLISHED`, correct | Touch only |
| Pixie Pods | Already `PUBLISHED`, real (a Black-owned mobile enrichment studio); `neighborhoodGuess` was generic "Brooklyn" | `neighborhoodGuess` enriched to confirmed home base "Downtown Brooklyn" (Atlantic Terminal Mall) |
| Sugar Hill Children's Museum of Art & Storytelling | Already `PUBLISHED`, correct | Touch only |
| Camp Kidville UWS | Already `PUBLISHED`, correct | Touch only |
| PMT House of Dance Kids | Real, well-known dance studio; stale "page too large" false block | → `BLOCKED_REPAIRABLE`, confirmed address (28 W 25th St, near Union Square) |
| Homage Skateboard Academy | Real (est. 2007); stored `sourceUrl` domain (homagebrooklyn.com) no longer resolves — a domain change, not off-topic | → `BLOCKED_REPAIRABLE`, confirmed current domain + address (83 3rd Ave, Boerum Hill) |
| Park Slope Day Camp | Real, established camp; confirmed main address plus area-wide shuttle service (not multiple physical locations — not a split candidate) | → `BLOCKED_REPAIRABLE` |
| Marks JCH Youth Programs | Real, well-established nonprofit community center; bot-blocked source | → `BLOCKED_REPAIRABLE`, confirmed address (7802 Bay Parkway, Bensonhurst) matches card exactly |
| HCHC Leadership Academy kids classes prospect | **Genuine no-match**: the only real "HCHC Leadership Academy" is an unrelated Howard County, Maryland homeschool co-op — no NYC entity found under this name/domain | Left `QUARANTINED` |
| Tribeca Language Brooklyn/Manhattan | Real, established (since 2007) language school with a genuine fixed studio (Tribeca) plus a broader Manhattan/Brooklyn service area | → `BLOCKED_REPAIRABLE`, `boroughGuess`/`neighborhoodGuess` corrected from a vague combined label to the real fixed location (hybrid-business rule) |

**New finding this batch**: a 3rd confirmed instance of the domain-change pattern (Homage Skateboard
Academy's stored `homagebrooklyn.com` no longer resolves; the real current site is
`homageskateboardacademy.com`) — reinforces this is a recurring, not one-off, failure mode alongside the
prior Urban Dunes/Kids Creative NYC instances. Also a clean application of the hybrid-business rule from
CLAUDE.md (Tribeca Language: real fixed studio + broader/online service area → anchor the card to the real
fixed location rather than a vague combined-borough label) and of the genuine-no-match principle (HCHC
Leadership Academy: a same-named real org exists, but in a different state entirely).

### Batch 16/10 (cards 151-160)

| Card | Finding | Action |
|---|---|---|
| RoboFun | **6th confirmed duplicate-content-card instance** — same sourceUrl as the already-fixed canonical "RoboFun Upper West Side" (batch 10) | → `BLOCKED_TERMINAL` (duplicate/superseded) |
| Brooklyn Conservatory of Music | Already `PUBLISHED`, correct | Touch only |
| Huntington Learning Center Upper West Side | Real, bot-blocked source; confirmed address (237 West 72nd St) matches card exactly | → `BLOCKED_REPAIRABLE` |
| LEGO Store Rockefeller Center - Kids Workshops | Real physical retail location with confirmed recurring in-store kids workshop programming | → `BLOCKED_REPAIRABLE` |
| Look Who's Talking NYC | Real, established program; confirmed dedicated address (301 E 73rd St, Upper East Side), other locations are real partner/host-site venues | → `BLOCKED_REPAIRABLE`, `boroughGuess`/`neighborhoodGuess` corrected from vague "NYC / Manhattan" |
| Trevor Day School Summer Programs | Real, well-known Manhattan private school; sourceUrl was a Google search link (explaining `low_source_trust`), but real summer programs independently confirmed | → `BLOCKED_REPAIRABLE` |
| "New" (The Canopy NYC) | **NEW pattern**: garbage single-word title ("New", truncated from "New Parent Workshops...") on an already-`PUBLISHED` live record, plus a wrong neighborhood ("East New York" instead of the real Williamsburg) | Title corrected to "The Canopy NYC - New Parent Workshop", `neighborhoodGuess` corrected to Williamsburg; kept as canonical |
| "And" (The Canopy NYC) | Same garbage-title defect ("And"), and a duplicate content card for the identical business/location as the card above | → `BLOCKED_TERMINAL` (duplicate) |
| Engineering For Kids Manhattan | Already `PUBLISHED`, real national STEM franchise (host-site delivery); stale `low_source_trust` blocker | Blocker cleared |
| Movement Gowanus Youth Programs | Already `PUBLISHED`, real climbing gym confirmed at 242 Butler St; stale `low_source_trust` blocker | Blocker cleared |

**New pattern this batch: a garbage single-word title extraction bug can reach an already-`PUBLISHED`
live record, not just an unpublished one.** Two sibling content cards for the same real business (The
Canopy, a Williamsburg baby/toddler play studio) were titled "New" and "And" — meaningless one-word
fragments truncated from their real source page titles ("New Parent Workshops Williamsburg..." and "Baby
and Mom Meetups Williamsburg..."). Both were `PUBLISHED` with zero blockers, meaning a family browsing the
live site would have seen a business card titled literally "New" or "And" with no indication of what it
even is. This is distinct from the already-documented "generic extraction artifact" pattern (e.g. a card
titled just "Camps" — still a real, meaningful word) — here the extracted fragment isn't even a coherent
category, just a stray word from a longer title. Combined with a wrong-neighborhood label on the same
record and a duplicate-card situation between the two siblings, this is the worst-quality live-record
defect combination found this session. `title` is writable on `contentCards` (already used once before for
the "Camps" case) — both were corrected: one renamed and kept canonical, the other marked `BLOCKED_TERMINAL`
as a duplicate. Worth treating a single-word or clearly-fragmentary title as its own trigger for a closer
look, independent of whether blockerCodes flag anything.

### Batch 17/10 (cards 161-170)

| Card | Finding | Action |
|---|---|---|
| West Side Taekwondo | Already `PUBLISHED`, real (est. 1992); stale `low_source_trust` | Blocker cleared |
| Music Together NYC UWS | Already `PUBLISHED`, real licensee (host-site delivery); stale `low_source_trust` | Blocker cleared |
| NYC Elite Gymnastics Upper East Side | Already `PUBLISHED`, correct | Touch only |
| NYC Elite Gymnastics Tribeca | Already `PUBLISHED`, correct — genuinely distinct location from its UES sibling (same brand, different neighborhood) | Touch only |
| Music Together Citywide NYC | Already `PUBLISHED`, correct, honest citywide host-site label | Touch only |
| Manhattan Youth Beach Volleyball at Pier 25 | Already `PUBLISHED`, correct | Touch only |
| The Little Gym Upper Westside | Real franchise location, confirmed address (2121 Broadway) matches card | → `BLOCKED_REPAIRABLE` |
| Gjøa Youth Soccer | Real, Brooklyn's oldest youth soccer nonprofit (since 1911); confirmed home field/office (Dyker Beach Park / 850 62nd St) | → `BLOCKED_REPAIRABLE`, `neighborhoodGuess` refined to Dyker Heights / Bay Ridge |
| iD Tech NYU | Real national STEM camp franchise at a real host university venue (NYU Washington Square/10th St); low-trust source was a search-engine link | → `BLOCKED_REPAIRABLE`, `neighborhoodGuess` enriched to Greenwich Village / Washington Square |
| Bedford Stuyvesant Early Childhood Development Center | Already `PUBLISHED`, correct | Touch only |

No new pattern this batch — all findings are instances of already-documented categories (stale
`low_source_trust` clearing, host-site delivery, search-engine-link-as-source, neighborhood-precision
enrichment).

### Batch 18/10 (cards 171-180)

| Card | Finding | Action |
|---|---|---|
| Bedstuy Community Partnership | Already `PUBLISHED`, correct | Touch only |
| Playgroup Nyc | Already `PUBLISHED`, correct | Touch only |
| City Kids Williamsburg | Real, confirmed address (240 Meeker Ave) matches card; stale `low_source_trust` | Blocker cleared |
| Brooklyn Bouldering Project Youth Programs | Real (formerly Brooklyn Boulders); confirmed Gowanus location; stale `low_source_trust` | Blocker cleared, `neighborhoodGuess` enriched from plain "Brooklyn" to Gowanus |
| Educational Alliance Youth Programs | Real, well-established (1889) settlement house nonprofit, confirmed HQ matches card; stale `low_source_trust` | Blocker cleared |
| Treasure Trunk Theatre | Real host-site theatre program across multiple confirmed Brooklyn venues, matching its own honest "Brooklyn-wide" label; stale `low_source_trust` | Blocker cleared |
| Kumon UWS | Real, confirmed location (700 Columbus Ave) matches card; low-trust source was a search-engine link | → `BLOCKED_REPAIRABLE` |
| Basis Independent Manhattan Camps | Real, confirmed Lower School campus (795 Columbus Ave) runs real summer camps; low-trust source was a search-engine link | → `BLOCKED_REPAIRABLE` |
| Creative Art Works Brooklyn | Already `PUBLISHED`, correct | Touch only |
| Marlene Meyerson JCC Manhattan | Already `PUBLISHED`, correct | Touch only |

No new pattern this batch — all findings are instances of already-documented categories (stale
`low_source_trust` clearing, host-site delivery, search-engine-link-as-source, neighborhood-precision
enrichment).

### Batch 19/10 (cards 181-190)

| Card | Finding | Action |
|---|---|---|
| Uws & Midtown Nyc Family Events | Real, confirmed active family-events resource; stale `low_source_trust` | Blocker cleared |
| Brooklyn Bridge Park | Real, well-known NYC park; stale `low_source_trust` | Blocker cleared, genuine `missing_age_range` gap retained |
| Aviator Sports Youth Programs | Already `PUBLISHED`, correct | Touch only |
| Brooklyn Brainery Kids / Family Workshops | Real venue, confirmed address matches card; stale `low_source_trust` | Blocker cleared |
| Vitor Shaolin's Brazilian Jiu Jitsu | Already `PUBLISHED`, correct | Touch only |
| Brooklyn Clay Industries Kids Workshops | Already `PUBLISHED`, correct | Touch only |
| Color Me Mine Bay Ridge | **3rd confirmed real-brand-fake-specific-location instance**: real franchise, but no Bay Ridge location found anywhere (real NYC locations are Tribeca, UWS, Baxter St) | → `QUARANTINED` |
| Downtown United Soccer Club | Real, well-established nonprofit (since 1982), confirmed at Pier 40 matching card; stale `low_source_trust` | Blocker cleared |
| "Psychology Today" | **NEW pattern**: sourceUrl is the directory site's own multi-result category SEARCH PAGE, not any single business — card title is literally the directory site's own name | → `BLOCKED_TERMINAL` (no repair possible) |
| Postpartum Resource Center of New York | **Related new finding**: real statewide nonprofit, but headquartered in West Islip, Long Island — "East New York" (this card's neighborhoodGuess) has no connection to it at all; its own source page is itself a referral directory to other providers, and its support groups rotate across venues statewide with no fixed NYC location | → `QUARANTINED` |

**New pattern this batch: a directory/media site's own search-results page can be scraped and mistaken for
a single business.** "Psychology Today"'s card came from `psychologytoday.com/us/groups/ny/brooklyn?category=pregnancy-prenatal-postpartum`
— a CATEGORY SEARCH page listing many unrelated therapist/group results, not any one entity. The card's own
title ("Psychology Today") is the tell: it's literally the directory site's own brand name, proof no
singular real business was ever identified during discovery. This is a step further than the
already-documented "real entity behind a bad source pick" case (CLAUDE.md's physical-only-providers
section, e.g. a `psychologytoday.com` page for one specific real therapist) — there, a real business sits
behind a bad source choice and can be found with a better source; here, the source itself never named any
one business, so there is nothing to repair. Marked `BLOCKED_TERMINAL`, not `QUARANTINED`, since no future
re-research could fix it.

**Related finding, same discovery run**: this "Psychology Today" card and the immediately-adjacent
"Postpartum Resource Center of New York" card share the identical `latestRunId`
(`run-b8m2jrt5-1782009599981`), identical `createdAt`/`updatedAt` timestamps, and the byte-identical
`neighborhoodGuess: "East New York"` — despite describing two completely unrelated organizations (one not
even a real single entity, the other a real Long Island nonprofit with no Brooklyn connection at all).
"East New York" also turned up as the wrong neighborhood on an unrelated card in batch 16 (The Canopy NYC,
a Williamsburg business). Worth flagging as a possible run-level or default-value bug — several
byte-identical wrong location values across unrelated cards is a different failure signature than an
individually-wrong-but-plausible guess, and may indicate a specific discovery run or fallback path is worth
a targeted sweep rather than treating each occurrence as an independent coincidence.

### Batch 20/10 (cards 191-200, FINAL of the cards 101-200 continuation)

| Card | Finding | Action |
|---|---|---|
| Big Apple Tutoring | Real, confirmed address (266 W 25th St, Chelsea); stale `low_source_trust` | Blocker cleared, `neighborhoodGuess` enriched to Chelsea |
| Little Shop of Crafts Birthday Parties | Real (Upper West Side confirmed), but no current UES location exists for this business — a different competitor has that | `neighborhoodGuess` corrected from "Upper West Side / UES" to just Upper West Side |
| Soccer Kids NYC Manhattan | **Entirely wrong borough**: real business, but confirmed Queens-only, zero Manhattan presence at all | Title corrected (dropped "Manhattan"), `boroughGuess`/`neighborhoodGuess` corrected to Queens |
| Little Scholars Brooklyn | Real, multi-location chain; card's own source described one specific new location | `neighborhoodGuess` corrected to Downtown Brooklyn (matching the source); split-candidate opportunity noted for a future pass, not acted on this round |
| FC Harlem | Real, confirmed address matches card; stale `low_source_trust` | Blocker cleared |
| Physique Swimming Battery Park City | Already `PUBLISHED`, correct | Touch only |
| NYC Cyclones Hockey | Real, confirmed home rink (Sky Rink at Chelsea Piers); odd combined borough label | `boroughGuess`/`neighborhoodGuess` corrected from "Manhattan/Brooklyn"/"NYC-wide" to Manhattan/Chelsea Piers |
| Fastbreak Sports Birthday Parties | **7th confirmed duplicate-content-card instance** — identical sourceUrl as its sibling | → `BLOCKED_TERMINAL` |
| Fastbreak Sports UES | Already `PUBLISHED`, correct; kept as canonical over its duplicate sibling above | Touch only |
| Engineering For Kids Brooklyn | Real, confirmed address (251 S 3rd St, Williamsburg); stale blockers | Blockers cleared, `neighborhoodGuess` enriched to Williamsburg |

**New finding this batch**: "Soccer Kids NYC Manhattan" is a real business but has ZERO presence in the
borough its own card title claims — its confirmed real service area is Queens only. Distinct in degree
from the earlier "wrong specific location within the right borough" cases (NYC Raptors Volleyball, City
Ice Pavilion) — this is a real business entirely absent from the claimed borough, not just misplaced within
it. Corrected the title itself (not just location fields) since "Manhattan" was baked into the card's own
name.

## Cards 101-200: continuation complete (2026-08-07)

Batches 11 through 20 are done — 100 more cards processed on top of the original 100-card test, per the
owner directive "go to the next 100 in the same NON-STOP way." Aggregate outcome across the 10 batches:
roughly 68 real entities corrected to `BLOCKED_REPAIRABLE` (including many stale `low_source_trust`
blockers cleared on already-`PUBLISHED` cards), roughly 24 already-correct cards touched, and roughly 8
cards quarantined/terminated on confirmed reality-check failures (a permanently-closed business, a
directory site's own search-results page mistaken for an entity, a wrongly-located out-of-market
nonprofit, unconfirmed real-brand-specific-locations, genuine-no-match cases, and confirmed duplicate
content cards). New patterns discovered and codified into CLAUDE.md this round: the confirmed-permanently-
closed-business case (City Treehouse), a garbage single-word title reaching an already-`PUBLISHED` record
(The Canopy NYC's "New"/"And" pair), a directory site's own multi-result search page mistaken for a single
entity (Psychology Today), and multiple cards sharing a byte-identical wrong default value as a possible
run-level bug signal (the recurring "East New York" value). The duplicate-content-card pattern grew from 5
to 7 confirmed instances (RoboFun again, then Fastbreak Sports), and the real-brand-fake-specific-location
pattern grew to a 3rd instance (Color Me Mine Bay Ridge). One split-candidate opportunity was identified
but deliberately deferred rather than acted on this round (Little Scholars, multiple confirmed Brooklyn
locations) — flagged for a future pass rather than rushed.

## Cards 201-500: third continuation, non-stop (owner directive, 2026-08-07)

### Batch 21/10 (cards 201-210)

| Card | Finding | Action |
|---|---|---|
| Bedford-Stuyvesant YMCA | Real YMCA branch, confirmed address (1121 Bedford Ave) matches card; stale `low_source_trust` | Blocker cleared |
| Fit4Dance Brooklyn | Real (12+ yrs), confirmed Crown Heights address matches card; a 2nd Brooklyn address noted as a future split candidate | Blocker cleared |
| Planet Han Mandarin | Real, **2 confirmed distinct Manhattan locations** (UWS 401 West End Ave, UES 1556 Third Ave) under one "Manhattan-wide" card | Blocker cleared, recorded as a one-card-per-location split candidate |
| Super Soccer Stars Upper West Side | Already `PUBLISHED`, correct | Touch only |
| Tutu School Brooklyn Heights | **4th real-brand-fake-specific-location instance**: franchise's own locations page lists no Brooklyn Heights studio (real Brooklyn ones are Dumbo, Boerum Hill, Park Slope) | → `QUARANTINED` |
| The Painted Pot Park Slope | Already `PUBLISHED`, correct | Touch only |
| Bedstuy Youth Soccer Club | Already `PUBLISHED`, correct | Touch only |
| Tutu School Williamsburg | **5th instance of the same pattern**, and unlike its sibling there is not even an adjacent real location to explain the label | → `QUARANTINED` |
| The Art Farm NYC | Already `PUBLISHED`, correct | Touch only |
| Sylvan Learning Upper East Side | Real franchise with a real Manhattan center — but at 200 W 86th St, the Upper **West** Side; no UES center found | `neighborhoodGuess` corrected, blocker cleared |

**Notable this batch**: two instances of the real-brand-fake-specific-location pattern surfaced on the
same brand in one batch (Tutu School), bringing that pattern to 5 confirmed instances. Both were
already-`PUBLISHED` live records. The Brooklyn Heights card is the more interesting of the two: two real
Tutu School studios (Dumbo, Boerum Hill) sit in the *same 11201 zip* as the claimed neighborhood, so the
card is plausibly a mislabel of one of them — but choosing between two equally-plausible real candidates
would be fabrication, so it was quarantined with all three confirmed real Brooklyn locations recorded for
a future split pass. Contrast with Sylvan Learning in the same batch, where exactly ONE real Manhattan
location existed, making a correction (rather than a quarantine) the honest call. **The distinction that
decides between correcting and quarantining is whether the research yields exactly one real answer.**

### Batch 22/10 (cards 211-220)

| Card | Finding | Action |
|---|---|---|
| Riverside Hawks Youth Basketball | Real 60+ yr nonprofit (Riverside Church Stone Gym, 84 Claremont Ave); its "UWS / Harlem" label is honest for Morningside Heights | Blocker cleared, kept **canonical** |
| Yorkville Youth Soccer | Real 50+ yr nonprofit, confirmed 415 E 90th St matches card | Blocker cleared |
| Jalopy Theatre School of Music | Real venue, confirmed 315 Columbia St matches card's Columbia Street Waterfront label | Blocker cleared |
| Collina Italiana Kids Italian | Real, confirmed 1556 Third Ave (UES) matches card — **same building as Planet Han UES; verified NOT a duplicate** | Blocker cleared |
| Riverside Hawks | **8th duplicate-content-card instance** (same org/domain as the canonical card above) | → `BLOCKED_TERMINAL` |
| VITAL Climbing Gym Brooklyn Youth | Already `PUBLISHED`, correct | Touch only |
| Tutu School UES | **6th real-brand-fake-location instance** — Tutu's only Manhattan studio is Tribeca | → `QUARANTINED` |
| EBL Coaching Manhattan | Already `PUBLISHED`, correct | Touch only |
| Prospect Park Zoo Education | Real WCS zoo with genuine education programming | Blocker cleared |
| Concurs De Matematica Online - Upper School | **NEW pattern** — a Romanian online-only math competition, live `PUBLISHED` with zero blockers | → `QUARANTINED` |

**New pattern this batch: an NYC neighborhood hallucinated out of a brand/domain token that merely
resembles a place name.** "Concurs De Matematica Online - Upper School" was live and `PUBLISHED` with zero
blockers, labelled Manhattan / **Upper West Side** — but it is a free ONLINE math competition for grades
II–VIII run by the Upper Education Foundation in **Romania**, held entirely on the `app.upper.school`
platform. It fails three checks simultaneously: the reality check (not an NYC activity), the physical-only
rule (online-only, no venue anywhere), and the out-of-market rule (Romania). The tell for the root cause is
the location itself: the fabricated "Upper West Side" almost certainly came from the token **"Upper"** in
the source's own domain, `upper.school` — a neighborhood invented from a brand string that happens to share
a word with an NYC place name, rather than from any location evidence. This is distinct from the
already-documented "byte-identical wrong default value" signal (East New York): that one repeats the *same*
wrong value across unrelated cards, whereas this one derives a *card-specific* wrong value from the card's
own name. Both are location fabrication, but they'd need different fixes upstream.

**Second new finding: a targeted sweep is cheap and it works — and it exposed a whole record class.**
Having flagged three fabricated Tutu School locations across two batches, a sweep by
`filter={"sourceHost":"tutuschool.com"}` (simple equality on any read-projection field — supported by
`/api/card-bridge/rows`, and much faster than waiting for the oldest-first queue to surface them) returned
25 rows and immediately found **two more live `PUBLISHED` Tutu School cards** (a 4th fabricated location,
"Tutu School UWS", and a generic "Tutu School Brooklyn" multi-location card). It also surfaced something
not previously documented anywhere in this repo: **the `contentCards` collection contains synthetic
`repair-*` records — one per (parent card × blocker code)** — e.g.
`repair-3e3b3eae96f3372b4e51eb26-missing_age_range`. They carry the parent's title with a `: <blockerCode>`
suffix, inherit the parent's `boroughGuess`/`neighborhoodGuess` (including fabricated ones), and are all
`BLOCKED_TERMINAL`. **22 of the 25 rows for this single domain were `repair-*` records, not real cards.**
They are not visitor-facing, so this is not a safety issue — but it materially changes what "a card" means
when counting this collection, and anyone reading `contentCards` totals (including the stats page) should
know most rows for a busy domain may be these. Recorded here rather than acted on; see the recommendation
below.

**Recommendation (main app, read-only from here)**: `repair-*` records appear to be pipeline-internal
repair tasks modelled as content cards in the same collection as real ones. Consider either a distinct
`kind` value or a separate collection, so that consumers counting or sampling `contentCards` don't
silently include them. This bridge deliberately makes no change — per the READ-ONLY convention, it is a
written recommendation for whoever owns `classscout`.

### Batch 23/10 (cards 221-230) — including the second-ever production split

| Card | Finding | Action |
|---|---|---|
| **Tutu School Brooklyn** | Real brand, 3 confirmed distinct real Brooklyn studios compressed into one "Brooklyn-wide" card | **`POST /split` → 3 real per-location cards**, parent → `BLOCKED_TERMINAL` |
| Tutu School UWS | **7th real-brand-fake-location instance** (4th fabricated Tutu card); no UWS studio exists | → `QUARANTINED` |
| Greenpoint YMCA Youth Programs | Real YMCA branch, confirmed Greenpoint address matches card | Blocker cleared |
| Vivvi Dumbo | Real 9,102 sq ft childcare center, confirmed 55 Prospect St matches card | Blocker cleared |
| Planet Han UWS | Already `PUBLISHED`, correct — the proper per-location card for one of the two Planet Han studios | Touch only |
| Bridge For Dance | Already `PUBLISHED`, correct | Touch only |
| Eastside Westside Music Together | Already `PUBLISHED`, correct | Touch only |
| Manhattan Youth Tennis | Already `PUBLISHED`, correct | Touch only |
| Fastbreak Sports | **10th duplicate instance — and the first THREE-card cluster** for one business | → `BLOCKED_TERMINAL` |
| Kids at Art NYC | Real studio, confirmed 1412 Second Ave matches card | Kept **canonical** |
| Kids at Art | **9th duplicate instance** (same domain/location as the card above) | → `BLOCKED_TERMINAL` |

**Second-ever production use of `POST /api/card-bridge/split`** (the first was Tennis Innovators). "Tutu
School Brooklyn" carried `neighborhoodGuess: "Brooklyn-wide"` while the franchise's own locations page lists
three genuinely distinct real studios — Dumbo (100 Jay St, 11201), Boerum Hill (200 Smith St, 11201) and
Park Slope (235 5th Ave, 11215). Each child was given its own verified-reachable location page
(`/dumbo/`, `/boerumhill/`, `/parkslope/`, all HTTP 200) as its distinguishing `sourceUrl`, satisfying the
split contract's one-real-source-per-child rule. Dry-run first, then applied: children
`cc-f3e2b1710ab896d473fc0cad`, `cc-e3cbf195a4e121d49a6ac945`, `cc-ea750ad380b22b4c5e3bf24c`.

**Confirmation the split hands children back to the real pipeline correctly**: the children are created in
`state: "DISCOVERED"`, and on re-fetch minutes later "Tutu School Dumbo" had already advanced on its own to
`PUBLISH_PREFLIGHT_READY` — i.e. the main app's own gate picked them up and is processing them, exactly the
intended behaviour. This is the first time that hand-off has been directly observed end-to-end, and it is
worth knowing: after a split, the children are the main app's to progress, not something this bridge should
push further.

**The Tutu School cluster, resolved.** Across batches 21–23 this single brand produced **four fabricated
per-neighborhood cards** (Brooklyn Heights, Williamsburg, UES, UWS — none of which the franchise has) plus
**one legitimate multi-location card** (the "Brooklyn-wide" one, now correctly split into its three real
studios). Every fabricated one was live and `PUBLISHED`. Four fabrications and one real record for one brand
is not four independent bad guesses — it reads as a discovery run enumerating plausible NYC neighborhoods
for a known brand name rather than reading the brand's actual location list. That makes it a sibling of the
`upper.school` finding in batch 22 (a location invented from a name) rather than of the stale-blocker cases.
Two of the four were found only because of the targeted sweep, not the oldest-first queue.

### Batch 24/10 (cards 231-240)

| Card | Finding | Action |
|---|---|---|
| New York City Children's Theater | Real nonprofit children's theater company | Blocker cleared |
| Brooklyn Music Factory | Real, confirmed 495 Carroll St (Gowanus) matches card | Blocker cleared |
| Camp Broadway | Real long-running youth theatre program, host-site delivery at real Midtown venues | Blocker cleared |
| Broadway Workshop | Real NYC youth musical-theatre training program in Midtown | Blocker cleared |
| West Side Soccer League | Already `PUBLISHED`, correct | Touch only |
| Bed-Stuy Sluggers Baseball League | Already `PUBLISHED`, correct | Touch only |
| Discovery Programs | Already `PUBLISHED`, correct | Touch only |
| Opus 118 Harlem School of Music | Already `PUBLISHED`, correct | Touch only |
| Homage Skateboard Academy Kids | **11th duplicate instance** — same 83 3rd Ave facility as the batch-15 card, labelled with the adjacent neighborhood name | → `BLOCKED_TERMINAL` |
| Bedford-Stuyvesant YMCA Youth Programs | **12th duplicate instance** — same branch as the batch-21 card | → `BLOCKED_TERMINAL` |

**Useful variant of the duplicate pattern this batch: two cards carrying DIFFERENT neighborhood labels are
not evidence of two locations when the street address is the same.** "Homage Skateboard Academy Kids"
(Gowanus) and the batch-15 "Homage Skateboard Academy" (Boerum Hill) look like two locations at a glance —
different neighborhoods, plausibly a second branch. They are one facility: 83 3rd Ave sits on the
Boerum Hill/Gowanus boundary, and the business's own site says Boerum Hill while directories describe it as
Gowanus/Boerum Hill. This is the mirror image of the already-documented negative control (two cards sharing
a DOMAIN turning out to be genuinely distinct locations — Modern Martial Arts, batch 12): shared domain
doesn't prove duplication, and differing neighborhood doesn't disprove it. **The street address is the
thing to compare; neighborhood labels are too soft to decide either way.**

### Batch 25/10 (cards 241-250)

| Card | Finding | Action |
|---|---|---|
| 2025 Ncaa Bracket: Scores, Stats… | **Live zero-blocker off-topic contamination** — an `ncaa.com` March Madness news article, fabricated as an Upper West Side activity | → `QUARANTINED` |
| F45 Training | **New sub-pattern**: real brand, but an ADULT fitness franchise (studios 18+), generic card with no specific studio | → `QUARANTINED` |
| Treasure Trunk Theatre Brooklyn | **13th duplicate instance** — single-neighborhood copy of a host-site program that correctly stays one broad card | → `BLOCKED_TERMINAL` |
| Brooklyn Craft Company Kids | Real, confirmed 165 Greenpoint Ave matches card, genuine kids classes | Blocker cleared |
| NYC Lions Youth Football | Real youth football organization | Blocker cleared |
| West Side YMCA | Real YMCA branch, confirmed 5 W 63rd St matches card | Blocker cleared |
| Hudson Cliffs Baseball League | Already `PUBLISHED`, correct | Touch only |
| Brooklyn Bridge Park Basketball Clinics | Already `PUBLISHED`, correct | Touch only |
| Bed-Stuy Sports Flag Football | Already `PUBLISHED`, correct | Touch only |
| Brooklyn Force Soccer | Already `PUBLISHED`, correct | Touch only |

**A second direct hit on the standing open item.** The NCAA card is exactly the failure CLAUDE.md has
flagged since the first 100-card pass: `PUBLISHED`, `blockerCodes: []`, nothing wrong on the record's face —
and it is a college-basketball news article, not a provider. As with `upper.school` in batch 22, its NYC
location was pure fabrication. That makes **two live zero-blocker off-topic cards in four batches** of this
third continuation, after the pattern was NOT reproduced at scale in the first 100. Both were found in the
ordinary oldest-first queue rather than by a targeted sweep, which supports the long-standing suspicion that
more remain.

**New sub-pattern: a real, reputable brand that is simply not a children's activity.** F45 Training is
unambiguously real and has real Brooklyn studios — every prior reality-check failure mode (never-real,
closed, off-topic, fabricated location) misses it. What fails is narrower: F45's own support documentation
puts studio membership at 18+ (16–17 only with guardian consent). The brand does run a separate youth
program ("F45 Prodigy", 11–17), but this card names no studio and carries a generic "Brooklyn" for both
borough and neighborhood, so nothing ties a real children's offering to a real place. **"Is this a real
business?" and "is this a children's activity?" are two different questions, and a card can pass the first
while failing the second.** Quarantined rather than repaired: a confirmed Brooklyn studio running Prodigy
would be a new, properly-located card, not a fix to this generic one.

### Owner-reported defect: the literal "NO CATEGORY" chip on live cards (2026-08-07)

**Owner directive: "Never add 'no category' even if no category."**

**What it is.** `"no category"` is an ingestion-only placeholder constant in the main app
(`extractionEngine.ts`'s `NO_CATEGORY_PLACEHOLDER`), seeded into `activityTypes`/`categoryHint` when
discovery has no category hint. It is supposed to be stripped before display — the main app has a
`stripActivityPlaceholder()` helper and an owner-reported fix dated 2026-08-01 that wired it into the read
paths (`topActivityTypes`, `publicListReads`, `publicDetailReads`, `readServingListings`, `activityMatch`).

**Why it still reached families, on two independent layers:**

1. **It is genuinely STORED in live data, not just a display artifact.** A bridge query
   (`filter={"activityTypes":"no category"}` on `providers`) found the literal string in **89 live provider
   records**. So the placeholder was never only cosmetic.
2. **Two main-app components render `provider.activityTypes` RAW, bypassing the normalization seam** —
   `ProviderProfile.tsx:511` and `ProviderDetailRouteView.tsx:260` both do `provider.activityTypes.map(...)`
   instead of going through `topActivityTypes()`. That is why the owner's screenshot shows **nine** activity
   chips (the seam caps at 3) with `NO CATEGORY` among them: the card in the screenshot matches
   `prov-aviator-sports-gymnastics`, whose stored array was exactly
   `["Gymnastics","Sports","Outdoor Activities","Soccer","Basketball","no category","Art","Music"]`.
   This is the same class of bug as the already-documented `MyAccountView.tsx` `activityTypes[0]` bypass —
   now **three** confirmed sites that skip the seam.

**What was fixed here (bridge side, all applied):**
- `alignActivityTypes()` now strips the placeholder before doing anything else. This was load-bearing, not
  cosmetic: the placeholder often sat at index 0, and when a title matched no activity label the function
  fell through to `candidates[0]` and **promoted `"no category"` to `primaryActivityType`** — worse than the
  mixed-category bug the module was built to fix.
- **Absolute boundary rule** in `validateWriteRequest`: no write through this bridge may put the placeholder
  into `category`, `categoryHint`, `primaryActivityType` or `activityTypes`, on any collection,
  case/whitespace-insensitive. When there is genuinely no category the correct value is **absent**, never a
  placeholder standing in for one.
- **Ported the main app's `ACTIVITY_KEYWORDS` regexes** for title matching. Removing the placeholder from
  slot 0 exposed the weakness underneath it: exact-substring title matching missed how listings actually
  name themselves, so "Park Slope Academy **Jiu Jitsu** Kids" became `Art` and "Take Me to the **Water**"
  became `Art`. With the ported patterns they resolve to `Martial Arts` and `Swimming`. Title keywords can
  only ever *reorder* activities the listing already carries — they never invent a tag.
- **Cleaned all 89 live provider records** (bounded loop: seen-set + stop-when-no-new + 40-round hard cap,
  per the runaway-loop convention). Verified 0 remaining in both `activityTypes` and `primaryActivityType`.

**Still outstanding**: `contentCards.categoryHint` still carries the placeholder, but every sampled record
is a synthetic `repair-*` row in `BLOCKED_TERMINAL` (see batch 22) — pipeline-internal and not
visitor-facing, so no family sees it.

**Recommendation (main app, read-only from here)** — two one-line-ish fixes:
1. `ProviderProfile.tsx:511` and `ProviderDetailRouteView.tsx:260` should render
   `topActivityTypes(provider)` rather than `provider.activityTypes`, matching every other surface. That
   alone fixes both the chip count (9 → 3) and the placeholder leak on the detail/profile pages.
2. Better still, stop seeding the placeholder at ingestion: `inferCategory()` returns
   `fallback || NO_CATEGORY_PLACEHOLDER`, so absence is represented by a magic string that then has to be
   stripped by every consumer forever. Returning `undefined` and letting the field be absent removes the
   whole class of bug.

### Batch 26/10 (cards 251-260)

| Card | Finding | Action |
|---|---|---|
| Masttro : Family Office Software… | **3rd live off-topic hit** — B2B wealth-management software; "Family Office" is a finance term, not a family activity | → `QUARANTINED` |
| Vivvi | **14th duplicate** (of the batch-23 Vivvi Dumbo card) | → `BLOCKED_TERMINAL` |
| Planet Han Chinese | **15th duplicate** (of the batch-23 Planet Han UWS card) | → `BLOCKED_TERMINAL` |
| Gjøa Youth Soccer Brooklyn | **16th duplicate** (of the batch-17 card) | → `BLOCKED_TERMINAL` |
| Downtown United Soccer Club | **17th duplicate** (of the batch-19 card) | → `BLOCKED_TERMINAL` |
| New York City's Ymca | Organization-level umbrella card, superseded by the real per-branch cards | → `BLOCKED_TERMINAL` |
| Park Slope Armory YMCA Youth Programs | Real branch, confirmed 361 15th St matches card | Blocker cleared |
| MatchPoint NYC | Real athletic club, confirmed 2781 Shell Rd; **2nd real location (9000 Bay Pkwy) recorded as a split candidate** | Blocker cleared |
| Riverside Park Conservancy | Real park nonprofit with genuine youth programming | Blocker cleared |
| North Brooklyn YMCA Youth Programs | Real branch serving Greenpoint/Williamsburg | Blocker cleared |

**Third live off-topic hit, and it completes a pattern: token collision on the TOPICAL axis.** Masttro is
software for *family offices* — private firms managing ultra-high-net-worth portfolios. The word "Family"
collided with this platform's family-activity vocabulary, exactly as "Upper" in `upper.school` collided
with "Upper West Side" in batch 22. Those two are the same failure wearing different clothes: **a term of
art from an unrelated domain that happens to share a word with this platform's vocabulary.** One landed on
the location axis, one on the topical axis. Worth naming as a class, because the detection cue is the same
in both: the card's own title contains the giveaway, and no amount of field-by-field checking finds it —
only asking "what is this entity, actually?"

**Duplicate count is now 17 and clearly systemic.** Five of this batch's ten cards were duplicates of cards
already corrected in batches 17, 19 and 23 — i.e. the queue is re-serving the same businesses under
slightly different titles. That is no longer a scattering of coincidences; it is a property of how these
discovery runs enumerated candidates. Recorded as a recommendation below.

**Recommendation (main app, read-only from here)**: content-card discovery appears to create multiple cards
for one business when it encounters the same domain under different titles/paths (bare name, name + program,
name + neighborhood). A dedupe key on `sourceHost` + normalized street address — rather than on title —
would collapse these at creation instead of leaving them to be found one at a time downstream.

### Batch 27/11 (cards 261-271) — the internal seed-card class, and how big duplication really is

| Card | Finding | Action |
|---|---|---|
| 9 × `classscout` seed cards | Physique Swimming BPC, Downtown Soccer League NYC, The Little Gym Brooklyn Heights, Imagine Swimming Brooklyn Heights, Brooklyn Italians SC, Brooklyn Martial Arts, Central Park Tennis Center Youth, Tiger Strong NYC, McCarren Tennis Center — **each individually verified to have a real externally-sourced sibling** | → `BLOCKED_TERMINAL` |
| Dodge YMCA | Real branch, 225 Atlantic Ave | Blocker cleared |
| Greenwich House Music School | Real, founded 1905, 46 Barrow St matches card | Blocker cleared |

**A third record class in `contentCards`: platform-generated seed cards.** After `repair-*` rows (batch 22),
these are cards whose `sourceHost` is the literal string `"classscout"` and whose `sourceUrl` is an internal
placeholder (`internal://classscout/source-seed/seed-<hash>`), sitting in `PARKED_COOLDOWN` with
`missing_source_url`. They are "we should source this business" to-do entries, not scraped cards. Not
visitor-facing, so not a safety issue — but they are counted as content cards. Each of the nine was checked
individually against its business rather than terminal-ed as a class, and **all nine already had a real
externally-sourced card**, so none represented unsourced work that would be lost.

**The duplication problem is much larger than the running count suggested.** Checking those nine businesses
by `normalizedTitle` returned, per business, not one card but **three to seven**:

| Business | Cards | Notable |
|---|---|---|
| Brooklyn Italians Soccer Club | **7** | one PUBLISHED, two PARKED_COOLDOWN, one DISCOVERED, one QUARANTINED, plus the seed |
| Tiger Strong NYC | **6** | three PUBLISHED — including one sourced from **en.wikipedia.org** |
| Brooklyn Martial Arts | **4** | split across `brooklynmartialarts.com` **and** `.net` |
| Physique Swimming BPC | **3** | two PUBLISHED differing only by locale path (`/` vs `/en/`) |

So the 17 duplicate instances counted one-at-a-time through batches 11–26 were not the population — they
were the ones the oldest-first queue happened to surface. **Three to seven cards per business appears to be
normal in this collection.** Two further sub-types show up here that earlier batches had not seen: the same
page under two locale paths, and one business split across two TLDs of its own name.

At that density, terminal-ing duplicates one at a time downstream is not a strategy — it is bailing. The
fix belongs at creation. Recorded as a recommendation rather than attempted here, because this bridge
cannot change how discovery creates cards.

**Recommendation (main app, read-only from here)** — strengthening the batch-26 note now that the scale is
known: dedupe content cards at creation on a key that survives the variation actually observed —
normalized `sourceHost` **registrable domain** (collapsing `.com`/`.net` siblings), with locale/path
prefixes (`/en/`) stripped, plus normalized street address where known. Titles vary too freely to be a key.
A one-off reconciliation pass over the existing collection would also be worth it: at 3–7 cards per
business, the published surface likely contains substantial hidden duplication that no amount of
oldest-first review will clear at a useful rate.

### Batch 28/10 (cards 272-281)

| Card | Finding | Action |
|---|---|---|
| 5 × `classscout` seed cards | Elite Skills Basketball, Shihan Martial Arts, The Party Fairy NYC, Playgarden Prep, Park Slope United SC — all verified to have real sourced siblings | → `BLOCKED_TERMINAL` |
| YouTube Partner Program Overview… | Google/YouTube **help documentation**, fabricated UWS location | `QUARANTINED` → `BLOCKED_TERMINAL` |
| Upload YouTube Videos - Computer… | Same — sibling help article | `QUARANTINED` → `BLOCKED_TERMINAL` |
| "Summer Camps" (Manhattanville) | Aggregator's own section label as the title; URL names the real business | Renamed **Steve & Kate's Camp - Upper West Side**, neighborhood corrected, kept canonical |
| "Summer Camps" (East Village) | **18th duplicate — byte-identical sourceUrl** to the card above | → `BLOCKED_TERMINAL` |
| "Kids Multi" | Class-label fragment as the title; `funfitnyc.com` names the business | Renamed **FunFit NYC** |

**The cleanest duplicate yet, and it says something.** The two "Summer Camps" cards have a *byte-identical*
`sourceUrl` — the same aggregator page scraped twice. No judgement call, no near-match: the same URL
produced two cards. Both inherited the directory's generic section label ("Summer Camps") instead of the
real business name, and each was assigned a **different fabricated neighborhood** (Manhattanville and East
Village) even though the URL itself contains `steve-kates-camp-manhattan-upper-west-side`. So the same
input yielded two different wrong answers — which means the neighborhood was not derived from the source at
all. That is direct evidence for the location-fabrication pattern first suspected with the repeated "East
New York" value (batch 19) and the `upper.school` collision (batch 22), and it strengthens the batch-27
recommendation: **`sourceUrl` equality alone would have caught this at creation.**

**Vendor help documentation is structurally unrepairable, like a directory search page.** Both YouTube
cards were correctly quarantined by the pipeline, but quarantine implies "re-research might fix this." A
Google product help article can never become a children's activity provider, so both were moved to
`BLOCKED_TERMINAL` — same reasoning as the Psychology Today search-results page in batch 19.

**Three title defects in one batch, one family.** "Summer Camps" (aggregator section label), "Kids Multi"
(class-listing fragment), and earlier "New"/"And" (batch 16) are all the same failure: **the title was taken
from page furniture rather than from the business.** Worth noting that in two of the three cases the real
business name was recoverable from the card's own `sourceUrl` without any external research —
`steve-kates-camp-manhattan-upper-west-side` and `funfitnyc.com` each name the business outright.

### Batch 29/10 (cards 282-291) — and a required change to how cards are selected

**Selection change, made this batch.** The globally-oldest-first query stopped returning reviewable work:
every row was a synthetic `repair-*` record already in `BLOCKED_TERMINAL`. Touching those would satisfy the
letter of the touch-always rule while doing nothing — precisely the churn the bulk-operations section warns
about. `/api/card-bridge/rows` supports equality filters on any projection field, so selection moved to
**oldest-first *within* a state**: `filter={"state":"PUBLISHED"}` first (live cards, highest family
impact), then `QUARANTINED`/`REPAIRING`/`DISCOVERED`/`PARKED_COOLDOWN`. This immediately surfaced real
defects the unfiltered queue could not reach. **Future passes should select by state, not globally.**

| Card | Finding | Action |
|---|---|---|
| "West" | Live, zero blockers, one-word title — and `summercamp-ny.com` is itself a camp **directory** ("NYC Summer Camps"), not a business | → `BLOCKED_TERMINAL` |
| Advantage QuickStart Tennis UES/UWS | Source is `myaccount.aidvantage.studentaid.gov/Route/Inbox` — a **federal student-loan servicer's account inbox** | → `QUARANTINED` |
| 14th Street Y Youth Programs | Real institution (344 E 14th St) attached to a **German travel page about Mount Rainier** | → `BLOCKED_REPAIRABLE`, re-source noted |
| The Paint Place Brooklyn | **8th real-brand-fake-location** — real locations are UWS and Astoria (Queens), no Brooklyn | → `QUARANTINED` |
| The Paint Place UWS | Real, confirmed 243 W 72nd St (earlier Amsterdam Ave listing is closed — moved, not shut) | Blockers cleared, kept canonical |
| Park Slope United Soccer Club (×2) | **19th duplicate** — the club had 4 cards total | One canonical, one → `BLOCKED_TERMINAL` |
| The School at Steps | Already `PUBLISHED`, correct | Touch only |
| Brooklyn Robot Foundry | Already `PUBLISHED`, correct | Touch only |
| Gymtime Rhythm & Glues | Real, confirmed 1520 York Ave | Blocker cleared |

**The name-collision class now has a third and much starker instance.** "Advantage QuickStart Tennis" was
sourced to **AIDVANTAGE**, the federal student-loan servicer — an authenticated `.gov` account-inbox URL
attached to a children's tennis card. With `upper.school`→"Upper West Side" (batch 22) and Masttro's
"Family Office" (batch 26), that is three separate cards whose source was chosen because a NAME matched,
with no check that the entity was even the same kind of thing. Note the honest limit of what this tells us:
Advantage QuickStart Tennis may well be a real NYC program — nothing about it is confirmed either way,
because the attached source describes something else entirely.

**A distinct, gentler case worth separating: real entity, absurd source.** The 14th Street Y is
unambiguously real, but its card pointed at a German travel article about Mount Rainier National Park.
Unlike the collision cases, there is no doubt about the entity — only the source is wrong — so the right
call is `BLOCKED_REPAIRABLE` with the real facts recorded for re-sourcing, **not** quarantining a genuine
community institution. The distinction that matters: *is the ENTITY in doubt, or only the SOURCE?*

### Batch 30/10 (cards 292-301) — 300-card mark passed

| Card | Finding | Action |
|---|---|---|
| Eye Level Learning Manhattan | Real international supplemental-education franchise with genuine Manhattan centres | Blocker cleared |
| The Play Lab Williamsburg | Real children's play/class space, matches card's neighborhood | Blocker cleared |
| Laser Bounce Brooklyn | Real family entertainment centre serving Borough Park | Blocker cleared |
| Gotham Tennis Academy Manhattan | Real Manhattan junior tennis program | Blocker cleared |
| 92NY Basketball | Real major UES institution (1395 Lexington Ave) with long-standing youth sports | Blocker cleared |
| American Youth Dance Theater | Already `PUBLISHED`, correct | Touch only |
| Baby Fingers | Already `PUBLISHED`, correct | Touch only |
| Chess at Three Manhattan | Already `PUBLISHED`, correct | Touch only |
| Physique Swimming Upper East Side | Correct — and verified a genuinely **distinct** real site, not a duplicate of its BPC/Brooklyn siblings | Touch only |
| Big City Volleyball Brooklyn | Already `PUBLISHED`, correct | Touch only |

A clean batch with no new defect patterns — 5 stale `low_source_trust` blockers cleared on real,
well-established institutions and 5 already-correct cards confirmed. Worth noting as a control: Physique
Swimming has four cards across BPC (×2), Brooklyn and UES, and only the BPC pair were duplicates — the
UES and Brooklyn cards are genuinely separate real locations. Card count alone never settles duplication;
the address does.

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
- v37 (2026-08-07, owner directive): "quarantine is not a question — shoot first, then ask" codified in
  `CLAUDE.md` — once the reality check fails, quarantine immediately (dry-run then apply) rather than
  pausing mid-loop for confirmation. Continuing the loop under this directive found a fifth off-topic
  instance in a row (Mashable TikTok-voiceover article) and a distinct pattern: a real out-of-market
  business (a Georgia camp company, `funclubs.com`) with a fabricated NYC location AND an aggregator-
  style mashup of three unrelated programs under one name — see both new sections above. The very next
  record checked (Tennis Innovators NYC, a real multi-location NYC tennis program) was correctly NOT
  quarantined, confirming the directive is "quarantine when the reality check fails," not "quarantine
  anything old."
- v38 (2026-08-07, owner directive): two hard rules added to the reality check, folded into the
  Verification Checklist (step 2/4, section A) and `CLAUDE.md`: (1) only physical, brick-and-mortar
  activities are in scope — e-commerce/shopping platforms, social media platforms, and pure online-only
  services are categorically prohibited regardless of the source domain vs. entity distinction (a real
  physical business sourced from a social-media page is a bad-source case, not a prohibition; a real
  physical business that also offers an online option keeps its card with the online language
  stripped); (2) an organization confirmed to operate more than one distinct physical location must
  become one card per location via `split`, proactively, not only when a review happens to notice.
- v39 (2026-08-07): first real-world application of the v38 split policy — `cc-9bbab6a42d8cfc4c2741ba77`
  ("Tennis Innovators NYC") split into 3 confirmed Manhattan location cards (94th St. Court, John Jay
  College/59th St., UES 78th St.), each with its own dedicated source page and real street address. Two
  more real locations (Fort Lee NJ, Water Mill/Hamptons) were deliberately excluded rather than
  fabricated into the split — see the new "First real-world use..." section above for why (out of the
  platform's 5-borough taxonomy; a Bronx partner location lacking its own distinct source). The existing
  live `providers` record was itself an aggregator-mashup of the site's general camps page and was
  quarantined separately rather than folded into the split.
- v40 (2026-08-07): a fifth stale-source_unreachable instance (`cc-a0ea07808aae9a8e53e77e80`, "Ninja
  Ballet Kids") showed the re-check doesn't always end in "clear the blocker and republish" — the source
  is reachable, but re-verifying it revealed a real adult-oriented dance/wellness company with no
  children's program at all; the card's own "Kids" title was fabricated. Corrected the title and
  rewrote `terminalReason` to state the real finding, left `state: QUARANTINED` unchanged. See the new
  addendum to "A source-unreachable blocker can be a stale false positive" above.
- v41 (2026-08-07): a 5-card batch of the next globally-oldest records found the queue's dominant issue
  here isn't off-topic contamination but stale source-check false positives on REAL businesses (4 of 5).
  Corrected all 5 (see the new "A 5-card batch..." section above): Dance Atlantic (real, but Iowa, not
  NYC), School of Rock Huntington (real, bot-blocked, real address/phone/hours found, but Long Island is
  outside the 5-borough taxonomy), Blue Balloon Songwriting School (real, but no fixed venue at all — a
  new physical-only sub-case), Tim Morehouse Fencing Club NYC (real, split into 2 confirmed Manhattan
  locations), and Hopalong Andrew (a real, well-known NYC performer rescued from wrongful quarantine via
  independent web search after his own site's genuine TLS failure). The 5-borough-taxonomy gap is now
  confirmed 3 times independently this session — escalated as a real product decision, not a one-off.
- v42 (2026-08-07): a 10-card batch confirmed the stale-blocker pattern at much higher confidence — all 10
  were real entities, zero off-topic contamination. 8 corrected as straightforward stale-blocker/bad-source
  cases (moved `QUARANTINED` → `BLOCKED_REPAIRABLE`); 1 (Crescents NYC Lacrosse → corrected to "Brooklyn
  Crescents Lacrosse Club") had a sourceUrl domain that never existed at all, a new failure-mode variant,
  with its own fabricated boroughGuess/neighborhoodGuess corrected via independent search; 1 (Make Meaning
  UES "legacy/prospect") could NOT be confirmed real at all and was correctly left `QUARANTINED` rather
  than assumed real — a needed reminder that "verify," not "assume real," is still the default even after
  9 real entities in a row. See the new "A 10-card batch..." section above.
- v43 (2026-08-07): the first real `shortDescription`/`longDescription` rewrite of the session
  (`prov-the-art-studio-ny`) — every prior fix touched `contentCards`, which has no description field at
  all. Replaced a generic identical-in-both-fields placeholder with specific, source-confirmed prose
  about the real West 72nd Street studio; applied the physical-only hybrid-business rule in practice for
  the first time (kept the card, led with the physical location over the online option); also fixed
  `address` and a `recurringPrograms` entry whose `timeText` had leaked raw internal pipeline metadata
  instead of a real schedule. See the new "First real description/copy enrichment..." section above.
- v44 (2026-08-07): started the owner-requested 100-card sovereign autonomous test (10 batches of 10,
  learn-and-improve-the-rules checkpoint after each). Adopted a compact table+callout reporting
  convention for this test rather than full prose per card. Batch 1/10 complete: 9 real entities
  corrected, 1 split (PLAYDAY → 2 real Brooklyn locations), 1 already-correct card touched, plus 4 bonus
  live-provider content-quality fixes found by cross-referencing a confirmed business's other pool
  entries rather than by oldest-first order alone. See the new "100-card sovereign autonomous test..."
  section above for the full batch table and new patterns found.
- v45 (2026-08-07): batch 2/10 of the 100-card test complete. 7 real entities corrected, 3 already-correct
  cards touched, plus a 2nd real description-enrichment (`prov-brooklyn-nets-basketball-academy`: filled
  in an empty neighborhood, cleaned a broken `"no category"` placeholder and spurious activityTypes,
  rewrote scraped-button-text copy into real prose). New patterns: a real multi-location franchise can
  have a wrong neighborhood matching NONE of its actual locations (clear it, don't guess); a content card
  can be quarantined while a live provider for the same entity already exists elsewhere (use
  `BLOCKED_TERMINAL`/superseded on the card, fix the live record directly). See "Batch 2/10..." above.
- v46 (2026-08-07): batch 3/10 of the 100-card test complete (9 of 10 cards; 10th deferred to batch 4). 7
  real entities corrected (persistent-502 network failures, stale source-unreachable blockers, a
  bot-blocked-but-independently-confirmed real business), 2 already-correct cards touched. No new pattern
  — reinforced existing ones (persistent 502 as a distinct failure mode; stale blockers on now-reachable
  sites; genuine entity-name ambiguity between two similarly-named real orgs, flagged not guessed). See
  "Batch 3/10..." above.
- v47 (2026-08-07): batch 4/10 of the 100-card test complete (cards 30-39, including the card deferred
  from batch 3). 8 real entities corrected, 2 already-correct cards touched. New pattern: a card's
  `sourceUrl` domain can be hijacked/squatted by entirely unrelated content after the real business moves
  to a different domain/TLD (Urban Dunes: `urbandunes.com` now serves an unrelated Dubai real-estate blog;
  the real business moved to `urbandunes.co`) — distinct from both off-topic contamination and a
  pipeline-guessed-wrong-domain; verify the entity via independent search rather than judging by what the
  stored sourceUrl currently resolves to. See "Batch 4/10..." above.
- v48 (2026-08-07): batch 5/10 of the 100-card test complete (cards 40-49, plus a 4-way split). 7 real
  entities corrected, 1 already-correct card touched, 1 duplicate-of-an-already-quarantined-sibling left
  QUARANTINED, 1 duplicate content card marked `BLOCKED_TERMINAL`, and a 4-location split (NY Preschool &
  Kids Club: Brooklyn Heights/Cobble Hill/Dumbo/Park Slope). Two new patterns: a card can be a genuine
  split candidate even while already `PUBLISHED`, not just `QUARANTINED`; two distinct content cards can
  represent the identical real physical location (differing only by title abbreviation) — pick one
  canonical, mark the other `BLOCKED_TERMINAL` as duplicate/superseded. See "Batch 5/10..." above.
- v49 (2026-08-07): batch 6/10 of the 100-card test complete (cards 50-57, plus a 2-way and a 3-way
  split). 7 real entities corrected, 1 already-correct card touched, 1 more title-abbreviation duplicate
  confirmed (Mathnasium UES vs. Mathnasium Upper East Side — 2nd instance of the batch-5 pattern), plus
  splits for Asphalt Green Soccer (UES + Battery Park City) and Playgarden Prep (Tribeca + UES + UWS). No
  new pattern — reinforced split-on-QUARANTINED-record, the duplicate-card pattern, and clarified that a
  domain redirect to a genuine related rebrand (Amerikick → brooklynmartialarts.net) is NOT the same
  failure as the batch-4 domain-hijack case. See "Batch 6/10..." above.
- v50 (2026-08-07): batch 7/10 of the 100-card test complete (cards 58-67). 9 real entities corrected, 1
  left `QUARANTINED` on genuine ambiguity. New pattern: a named real organization can still fail the
  reality check for a SPECIFIC card even though it clearly exists — Liberated Movement is a real nonprofit
  but its studio closed, it now rents space elsewhere, and nothing ties it to "kids" classes or to
  "Prospect" (the card's own neighborhood claim); left `QUARANTINED` rather than assumed real, findings
  documented for a future re-research pass. See "Batch 7/10..." above.
- v51 (2026-08-07): batch 8/10 of the 100-card test complete (cards 68-77). 8 real entities corrected, 2
  already-correct cards touched, including a 6th confirmed instance of the out-of-5-borough-taxonomy gap
  (Science Museum of Long Island) and a wrong-borough correction (City Ice Pavilion: "Brooklyn/Queens
  border" → confirmed squarely Queens/Long Island City). Methodology correction, not a new content
  pattern: 2 TLS failures this batch traced to this research environment's own egress-proxy certificate,
  not the origin site — check the certificate issuer before calling a TLS failure a genuine site-side
  defect. See "Batch 8/10..." above.
- v52 (2026-08-07): batch 9/10 of the 100-card test complete (cards 78-87). 4 real entities corrected, 4
  already-correct cards touched (including a significant wrong-neighborhood fix on an already-`PUBLISHED`
  card — Henry Street Settlement, "Harlem" corrected to its actual Lower East Side home of 130+ years), a
  3rd confirmed duplicate-content-card instance (Gymstars Brooklyn), and a stale blocker cleared on an
  already-`PUBLISHED` card (Manhattan Kickers). New pattern: a real brand's card can still fail the
  reality check if the SPECIFIC location it claims is confirmed not to exist — PLAYDAY NYC Tribeca left
  `QUARANTINED` even though PLAYDAY itself is real (2 other locations already correctly split in batch 1),
  because independent search confirmed no Tribeca studio ever opened or it has since closed. See "Batch
  9/10..." above.
- v53 (2026-08-07): batch 10/10 (FINAL) of the 100-card test complete — the owner-requested 100-card
  sovereign autonomous test is done. 7 real entities corrected, 3 already-correct cards touched (including
  the 100th completing card, Sinergia Ny), 2 left `QUARANTINED` (Little Notes NYC on a genuine
  organization/location mismatch; Tiger Schulmann's Park Slope as a 2nd confirmed instance of the
  real-brand-fake-specific-location pattern from batch 9). Added a full retrospective section summarizing
  all 100 cards, the split-off children, the aggregate outcome distribution, and every pattern discovered
  across the test. See "Batch 10/10..." and the new "100-card sovereign autonomous test — retrospective"
  section above.
- v54 (2026-08-07, owner directive): replaced the `activityTypes` "cap at 3, source order" rule with real
  top-3 SELECTION logic — `src/lib/delivery/activityAlignment.ts`'s `alignActivityTypes()`, wired into
  `applyCardBridgeWrite` for every `providers` write touching `activityTypes`/`primaryActivityType`. Fixes
  the exact case already flagged in "A spurious 'Music' activityType..." (found earlier this session) at
  the code level instead of leaving it a manual-review-only flag: primary activity determined from
  `primaryActivityType`/title, only same-cluster activities kept (4 clusters mirroring the main app's own
  `ACTIVITY_KEYWORDS` vocabulary), capped at 3, primary always first. 9 new unit tests, including the
  literal owner-reported case (Music/Basketball/Sports/Soccer/Handball → Basketball/Sports/Soccer).
  Read `/workspace/classscout` (read-only, per CLAUDE.md) to confirm root cause and scope: the main app's
  `primaryActivityClassifier.ts`/`categoryBanner.ts` already do the "which ONE activity leads" half
  correctly almost everywhere — the one place that doesn't is `MyAccountView.tsx`'s `SavedProviderCard`,
  which reads `activityTypes[0]` directly, a one-line fix documented above for whoever owns that repo.
- v55 (2026-08-07): started the owner-requested continuation past the first 100-card test — cards
  101-200, same batch-of-10 cycle, non-stop. Batch 11/10 (cards 101-110) complete: 8 real entities
  corrected, 2 already-correct cards touched. New pattern: a duplicate-content-card pair can have BOTH
  sides already `PUBLISHED`/correct (Manhattan Youth Downtown Community Center vs. its batch-3 sibling) —
  unlike every prior duplicate instance, neither side needs fixing here, so both are left as-is rather
  than demoting a correct live record just to resolve the duplication. See "Cards 101-200..." above.
- v56 (2026-08-07): batch 12/10 (cards 111-120) complete. 6 real entities corrected, 3 already-correct
  cards touched, 1 more duplicate-content-card instance (RoboFun, 5th confirmed). 2nd confirmed
  domain-hijack instance (Kids Creative NYC, sourceUrl now an Indonesian gambling site) reinforces the
  batch-4 pattern is recurring, not one-off. Also confirmed a useful negative control: 2 cards sharing a
  domain (Modern Martial Arts NYC's Tribeca and UWS locations) verified as genuinely distinct real
  locations, not a duplicate — shared domain alone isn't sufficient evidence, always verify. See
  "Batch 12/10..." above.
- v57 (2026-08-07): batch 13/10 (cards 121-130) complete. 5 real entities corrected, 3 already-correct
  cards touched, 2 genuine-ambiguity cases left `QUARANTINED` (Coach Derek Sports — only confirmable in
  California, not NYC; South Brooklyn United — no matching org found, a similarly-named real org exists
  in a different borough), plus a 3rd confirmed instance of the Blue Balloon no-fixed-venue business under
  yet another card. See "Batch 13/10..." above.
- v58 (2026-08-07): batch 14/10 (cards 131-140) complete. 6 real entities corrected (including a wrong-
  borough fix, an out-of-taxonomy 8th instance, and a falsely-narrowed-neighborhood fix), 2 already-correct
  cards touched, 1 left `QUARANTINED` on a **new pattern**: a business confirmed permanently CLOSED (City
  Treehouse) — treated as a reality-check failure the same as a never-real business, since presenting a
  closed business as a live option misleads families just as badly, even though it was genuinely real at
  some point. Distinct from every prior "real but blocked" pattern (all of which describe still-operating
  businesses). Added a matching CLAUDE.md "Hard-won lessons" bullet. See "Batch 14/10..." above.
- v59 (2026-08-07): batch 15/10 (cards 141-150) complete. 6 real entities corrected, 3 already-correct
  cards touched (one with a neighborhood enrichment: Pixie Pods), 1 left `QUARANTINED` on a genuine
  no-match (HCHC Leadership Academy — the only real org under this name is an unrelated Maryland
  homeschool co-op). 3rd confirmed domain-change instance (Homage Skateboard Academy), and a clean
  hybrid-business-rule application (Tribeca Language: real fixed studio + broader service area, anchored
  to the real location instead of a vague combined-borough label). See "Batch 15/10..." above.
- v60 (2026-08-07): batch 16/10 (cards 151-160) complete. 6 real entities corrected (2 stale
  `low_source_trust` blockers cleared on already-`PUBLISHED` cards, a 6th confirmed duplicate-content-card
  instance for RoboFun), 1 already-correct card touched. New pattern: a garbage single-word title
  ("New"/"And", truncated source-title fragments) can reach an already-`PUBLISHED` live record, combined
  here with a wrong neighborhood and a duplicate-card pair for the same business (The Canopy, Williamsburg)
  — worse in degree than the already-documented generic-extraction-artifact pattern since the fragment
  isn't even a coherent word. Added a matching CLAUDE.md "Hard-won lessons" bullet. See "Batch 16/10..."
  above.
- v61 (2026-08-07): batch 17/10 (cards 161-170) complete. 5 real entities corrected (2 stale
  `low_source_trust` blockers cleared, 3 new `BLOCKED_REPAIRABLE` fixes with neighborhood enrichment), 5
  already-correct cards touched. No new pattern — all findings are instances of already-documented
  categories. See "Batch 17/10..." above.
- v62 (2026-08-07): batch 18/10 (cards 171-180) complete. 6 real entities corrected (4 stale
  `low_source_trust` blockers cleared, 2 new `BLOCKED_REPAIRABLE` fixes for search-engine-link-sourced
  cards), 4 already-correct cards touched. No new pattern. See "Batch 18/10..." above.
- v63 (2026-08-07): batch 19/10 (cards 181-190) complete. 4 stale `low_source_trust` blockers cleared, 3
  already-correct cards touched, 3 cards quarantined/terminated on reality-check failures. New pattern: a
  directory site's own multi-result search-results page (not a page for any single business) can be
  scraped and mistaken for one entity — "Psychology Today"'s card came from a Psychology Today category
  search URL, with the card's own title literally being the directory site's brand name; marked
  `BLOCKED_TERMINAL` since no repair is possible. Related finding: that card and an adjacent one
  (Postpartum Resource Center of New York, a real but wrongly-located Long Island nonprofit) share an
  identical `latestRunId` and a byte-identical wrong `neighborhoodGuess` ("East New York" — also seen on an
  unrelated batch-16 card), suggesting a possible run-level or default-value bug worth a targeted sweep.
  Also a 3rd confirmed real-brand-fake-specific-location instance (Color Me Mine Bay Ridge — no such
  location exists). Added a matching CLAUDE.md "Hard-won lessons" bullet. See "Batch 19/10..." above.
- v64 (2026-08-07): batch 20/10 (cards 191-200) complete — this is also the FINAL batch of the cards
  101-200 continuation. 7 real entities corrected (5 stale blockers cleared, 2 wrong-location corrections),
  2 already-correct cards touched, 1 marked `BLOCKED_TERMINAL` as a 7th confirmed duplicate-content-card
  instance (Fastbreak Sports). New finding: a real business (Soccer Kids NYC) with its own card title
  claiming a borough (Manhattan) it has ZERO actual presence in — its confirmed real service area is
  Queens only — corrected both the title and location fields. Added the "Cards 101-200: continuation
  complete" retrospective section summarizing all 10 batches. See "Batch 20/10..." above.
- v65 (2026-08-07): started the owner-requested third continuation (cards 201-500), same batch-of-10
  cycle, non-stop. Batch 21/10 (cards 201-210) complete: 4 real entities corrected (3 stale
  `low_source_trust` blockers cleared, 1 wrong-neighborhood fix), 4 already-correct cards touched, 2
  quarantined as the 4th and 5th confirmed real-brand-fake-specific-location instances (Tutu School
  Brooklyn Heights and Williamsburg — the franchise's own locations page lists neither). Sharpened the
  operating rule that distinguishes correcting from quarantining in that pattern: correct when research
  yields exactly ONE real answer (Sylvan Learning, same batch), quarantine when it yields zero or several
  equally-plausible ones (both Tutu School cards). See "Batch 21/10..." above.
- v66 (2026-08-07): batch 22/10 (cards 211-220) complete. 5 real entities corrected (stale
  `low_source_trust` blockers cleared), 2 already-correct cards touched, 1 marked `BLOCKED_TERMINAL` as an
  8th duplicate-content-card instance (Riverside Hawks), 2 quarantined. New pattern: an NYC neighborhood
  hallucinated out of a brand/domain token that merely resembles a place name — a Romanian ONLINE-only math
  competition (`upper.school`) was live `PUBLISHED` with zero blockers and labelled "Upper West Side",
  apparently from the word "Upper" in its own domain; distinct from the byte-identical-default-value signal
  because the wrong value is derived per-card rather than repeated across cards. Also demonstrated that a
  targeted `filter={"sourceHost":...}` sweep is cheap and effective: it found 2 more live Tutu School cards
  the oldest-first queue had not yet reached, and revealed that `contentCards` contains synthetic `repair-*`
  records (one per parent card x blocker code) which made up 22 of 25 rows for that domain — recorded with
  a recommendation for the main app. See "Batch 22/10..." above.
- v67 (2026-08-07): batch 23/10 (cards 221-230) complete, including the **second-ever production split**.
  "Tutu School Brooklyn" (a generic "Brooklyn-wide" card) split via `POST /split` into its 3 confirmed real
  studios (Dumbo, Boerum Hill, Park Slope), each with its own verified-reachable location page as its
  distinguishing source; parent -> `BLOCKED_TERMINAL`. First direct end-to-end observation that split
  children re-enter the main app's own pipeline: a child created in `DISCOVERED` had advanced itself to
  `PUBLISH_PREFLIGHT_READY` on re-fetch. Also: 2 real entities corrected, 4 already-correct cards touched,
  1 quarantined as the 7th real-brand-fake-location instance (Tutu School UWS, the 4th fabricated card for
  that one brand), and 2 marked terminal as the 9th and 10th duplicate-content-card instances (Kids at Art;
  Fastbreak Sports -- the first confirmed THREE-card cluster for a single business). See "Batch 23/10..."
  above.
- v68 (2026-08-07): batch 24/10 (cards 231-240) complete. 4 real entities corrected (stale
  `low_source_trust` blockers cleared), 4 already-correct cards touched, 2 marked terminal as the 11th and
  12th duplicate-content-card instances (Homage Skateboard Academy, Bedford-Stuyvesant YMCA). Useful
  refinement of the duplicate rule: differing neighborhood labels on two cards do NOT indicate two
  locations when the street address is identical (Homage's single 83 3rd Ave facility sits on the
  Boerum Hill/Gowanus line and is described both ways) -- compare street addresses, not neighborhood
  labels, in either direction. See "Batch 24/10..." above.
- v69 (2026-08-07): batch 25/10 (cards 241-250) complete. 3 real entities corrected, 4 already-correct
  cards touched, 1 marked terminal as the 13th duplicate instance, and 2 quarantined. Second live
  zero-blocker off-topic contamination of this continuation (an `ncaa.com` March Madness article published
  as an Upper West Side activity), reinforcing that the standing open item is real and under-detected. New
  sub-pattern: a real, reputable brand that simply is not a children's activity -- F45 Training's studios
  are 18+ per its own documentation, and the card named no studio and no real address, so "is it real?" and
  "is it for children?" separated for the first time as independent checks. See "Batch 25/10..." above.
- v70 (2026-08-07, owner-reported defect): fixed the literal "NO CATEGORY" chip appearing on live cards.
  Confirmed it was STORED in 89 live `providers.activityTypes` records, not merely a display artifact, and
  traced the display half to two main-app components rendering `provider.activityTypes` raw instead of via
  `topActivityTypes()` (a third confirmed instance of the normalization-seam bypass). Bridge-side:
  `alignActivityTypes()` now strips the placeholder first (it could previously be PROMOTED to
  `primaryActivityType`); a new absolute boundary rule in `validateWriteRequest` rejects it in `category`,
  `categoryHint`, `primaryActivityType` and `activityTypes` on every collection (owner directive: "never
  add 'no category' even if no category"); and the main app's `ACTIVITY_KEYWORDS` regexes were ported for
  title matching after the strip exposed that exact-substring matching mis-resolved real listings ("Jiu
  Jitsu" -> Art, "Water" -> Art; now Martial Arts and Swimming). All 89 records cleaned via a bounded loop;
  0 remain. 8 new unit tests (153 total passing). Recommendation recorded for the main app. See the
  "Owner-reported defect..." section above.
- v71 (2026-08-07): batch 26/10 (cards 251-260) complete. 4 real entities corrected (stale
  `low_source_trust` blockers cleared; MatchPoint NYC recorded as a 2-location split candidate), 5 marked
  terminal as the 14th-17th duplicate-content-card instances plus one organization-level umbrella card, and
  1 quarantined as the **third** live zero-blocker off-topic contamination of this continuation (Masttro,
  B2B family-office wealth-management software). Named the shared class behind Masttro and the batch-22
  `upper.school` case: a term of art from an unrelated domain colliding with this platform's vocabulary --
  "Family Office" on the topical axis, "Upper" on the location axis. Duplicates now at 17 confirmed and
  clearly systemic (5 in this batch alone), with a dedupe-key recommendation recorded for the main app.
  See "Batch 26/10..." above.
- v72 (2026-08-07): batch 27/11 (cards 261-271) complete. 2 real entities corrected (Dodge YMCA,
  Greenwich House Music School) and 9 internal `classscout` seed cards marked terminal -- a THIRD
  `contentCards` record class after real cards and `repair-*` rows: platform-generated "should source this"
  entries with `sourceHost: "classscout"` and an `internal://` placeholder URL. Each was verified
  individually to have a real externally-sourced sibling before being terminal-ed. Headline finding: those
  nine lookups revealed **3-7 cards per business** (Brooklyn Italians 7, Tiger Strong 6 including one
  sourced from Wikipedia, Brooklyn Martial Arts 4 across .com and .net, Physique Swimming 3 with two
  PUBLISHED differing only by `/en/` locale path) -- so the 17 duplicates counted so far were only what the
  oldest-first queue surfaced, not the population. Two new duplicate sub-types (locale-path variants,
  same-name different-TLD). Recommendation upgraded accordingly: dedupe at creation on registrable domain +
  stripped locale path + street address, plus a one-off reconciliation pass. See "Batch 27/11..." above.
- v73 (2026-08-07): batch 28/10 (cards 272-281) complete. 5 more `classscout` seed cards terminal-ed
  (each verified to have a real sourced sibling), 2 Google/YouTube help-documentation cards moved from
  `QUARANTINED` to `BLOCKED_TERMINAL` as structurally unrepairable, 2 title defects corrected from facts in
  the cards' own sourceUrls ("Summer Camps" -> Steve & Kate's Camp - Upper West Side; "Kids Multi" ->
  FunFit NYC), and the 18th duplicate instance marked terminal. That duplicate is the clearest yet: a
  BYTE-IDENTICAL sourceUrl scraped twice, producing two cards with two DIFFERENT fabricated neighborhoods
  (Manhattanville, East Village) despite the URL itself reading `...manhattan-upper-west-side` -- direct
  evidence that neighborhood is not being derived from the source, and that plain sourceUrl equality would
  have caught the duplicate at creation. See "Batch 28/10..." above.
- v74 (2026-08-07): batch 29/10 (cards 282-291) complete, and **selection strategy changed**: the
  globally-oldest-first query had filled with synthetic `repair-*` rows already in `BLOCKED_TERMINAL`, so
  selection moved to oldest-first WITHIN a state (`filter={"state":"PUBLISHED"}` first). That immediately
  surfaced defects the unfiltered queue could not reach. Findings: a live zero-blocker card titled "West"
  sourced from a camp DIRECTORY site (terminal); a tennis card sourced to AIDVANTAGE, the federal
  student-loan servicer's authenticated inbox URL -- a third name-collision instance after upper.school and
  Masttro, and the starkest yet; the 14th Street Y attached to a German travel page about Mount Rainier,
  separated as a distinct "real entity, absurd source" case fixed by re-sourcing rather than quarantine;
  an 8th real-brand-fake-location (no Brooklyn Paint Place -- real ones are UWS and Astoria); and a 19th
  duplicate. 3 real entities corrected, 2 touched. See "Batch 29/10..." above.
- v75 (2026-08-07): batch 30/10 (cards 292-301) complete -- **the 300-card mark of the owner-requested
  cards 201-500 continuation is passed** (301 cards reviewed in this third pass; ~501 across all three).
  5 real entities corrected (stale `low_source_trust` cleared on Eye Level Learning, The Play Lab, Laser
  Bounce, Gotham Tennis Academy, 92NY) and 5 already-correct cards touched. No new defect patterns. Useful
  control observed: Physique Swimming has 4 cards, but only the Battery Park City pair were duplicates --
  the UES and Brooklyn cards are genuinely distinct real locations, reinforcing that card count never
  settles duplication, the street address does. See "Batch 30/10..." above.
