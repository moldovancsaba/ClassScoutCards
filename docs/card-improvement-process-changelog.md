# Card Improvement Process — Changelog

Split out of `docs/card-improvement-process.md` on 2026-08-10, purely for file size — the combined file
had grown to roughly 10,000 lines. This file is a verbatim continuation of that document's own
`## Changelog` section; nothing here was rewritten or condensed. **Read `docs/card-improvement-process.md`
first** — it has the actual SOP (purpose, the loop, decision matrices, the standing rules). This file is
the running history: every dated batch entry, in the order it was written.

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
- v76 (2026-08-07): batch 31/10 (cards 302-311) complete. 8 stale `low_source_trust` blockers cleared on
  real, independently-confirmed institutions (Launch Math, Brooklyn United Academy, Karate City, The Door,
  Evolutionary Martial Arts, Russian School of Mathematics, New-York Historical Society, iCAMP), 2
  already-correct cards touched. No new defect patterns, but a cumulative observation recorded as a
  recommendation: across batches 17-31 `low_source_trust` has been cleared on dozens of cards that were
  real and has never once flagged a genuinely fake one -- every fabricated card in this continuation was
  caught by the reality check instead. The blocker appears to fire on ordinary first-party business domains
  and is adding review noise rather than signal. See "Batch 31/10..." above.
- v77 (2026-08-07): batch 32/10 (cards 312-321) complete. 8 stale `low_source_trust` blockers cleared on
  confirmed real entities (Lavender Blues, Barking Cat Studio, Brooklyn Basketball Academy, Berkeley
  Carroll, UrbanGlass, Ferox Ninja Park, Irish Arts Center, Hudson River Community Sailing) and a 20th
  duplicate instance resolved. That duplicate REVERSES a batch-30 decision: "92NY Basketball" was cleared
  as canonical before its broader same-address sibling ("92NY May Center / Sports Programs", 1395 Lexington
  Ave) was visible; the May Center card is now canonical and the basketball card terminal, with both
  reasons recording the supersession explicitly. Names the underlying hazard: reviewing one card at a time
  makes duplicate detection order-dependent, since nothing on a card reveals that a sibling exists --
  only a same-address check or dedupe-at-creation removes the guesswork. See "Batch 32/10..." above.
- v78 (2026-08-07): batch 33/10 (cards 322-331) complete. 6 stale `low_source_trust` blockers cleared
  (Children's Aid Athletics, Writopia Lab, Puppetsburg, McBurney YMCA, 78 Youth Sports, OLS Little League),
  2 already-correct cards touched, and the 21st and 22nd duplicates marked terminal. Both duplicates were
  siblings of cards cleared as canonical in the immediately preceding batch -- direct confirmation of the
  order-dependence hazard named in batch 32: because the queue orders by `updatedAt`, touching one sibling
  pushes it back and leaves its twin near the front, so reviewing a card reliably surfaces its duplicate
  one batch later. Predictable, but it means the duplicate count grows in step with review volume rather
  than converging -- reinforcing that dedupe belongs at creation. See "Batch 33/10..." above.
- v79 (2026-08-07): batch 34/10 (cards 332-341) complete. 6 real entities corrected (4 stale
  `low_source_trust` cleared; Manhattan Youth Flag Football's blockers cleared as a real host-site program),
  3 already-correct cards touched, and the bare "Manhattan Youth" umbrella card marked terminal (same
  treatment as "New York City's Ymca" in batch 26; all its real location and program cards remain).
  Deliberately did NOT call a duplicate between "Steve & Kate's Camp Manhattan" (own domain) and
  "Steve & Kate's Camp - Upper West Side" (batch 28): they are at different granularity and the chain has
  more than one NYC site, so collapsing them risked destroying a real location card -- recorded as a split
  candidate. Counterpart to the batch-32 reversal: only call a duplicate when the ADDRESSES match.
  See "Batch 34/10..." above.
- v80 (2026-08-07): batch 35/10 (cards 342-351) complete. 6 stale `low_source_trust` blockers cleared, 2
  already-correct cards touched, and a 23rd duplicate that SUPERSEDES the batch-29 call on the 14th Street
  Y: that card (sourced to a German travel page about Mount Rainier) was set `BLOCKED_REPAIRABLE` with a
  re-source plan, but the correctly-sourced `14streety.org` card already existed and had not yet surfaced --
  so re-sourcing would have created a duplicate rather than fixed anything. Third order-dependence case in
  four batches. Added a process amendment: when a card is real but mis-sourced, look the business up by
  `normalizedTitle` BEFORE prescribing a re-source; if a correctly-sourced sibling exists the right action
  is `BLOCKED_TERMINAL`, not `BLOCKED_REPAIRABLE`. See "Batch 35/10..." above.
- v81 (2026-08-07): batch 36/10 (cards 352-361) complete. 7 real entities corrected, 2 already-correct
  cards touched, 24th duplicate marked terminal (Greenpoint YMCA -- the FOURTH ymcanyc.org duplication,
  suggesting a per-domain sweep would clear the rest in one pass). New defect: internal pipeline jargon in
  a family-facing location field -- apple seeds carried `neighborhoodGuess: "Near Manhattan priority
  zones"`, the pipeline's own targeting vocabulary shown as if it were a place (2nd instance; also seen on
  City Treehouse in batch 14). That makes three separate cases of internal machinery surfacing verbatim to
  families, alongside scraper metadata in schedule fields and the `"no category"` placeholder. Corrected to
  the confirmed real location, with genuine uncertainty about which apple seeds sites are currently open
  written into `terminalReason` rather than guessed. Negative control recorded: Goethe-Institut's
  `goethe.de` source is a foreign TLD but the entity's OWN domain -- country of registration is not
  evidence of off-topic contamination. See "Batch 36/10..." above.
- v82 (2026-08-07): batch 37/16 (cards 362-377) -- **first per-domain duplicate sweep**, acting on the
  batch-36 recommendation. `filter={"sourceHost":"ymcanyc.org"}` returned 16 non-repair cards for ~7 real
  branches: Dodge had FOUR cards, North Brooklyn three, the Park Slope area five, plus the org's own
  locations index page masquerading as an entity. Resolved as one operation: 11 terminal, 5 canonical
  (duplicate instances 25-33). The Park Slope group is the instructive part -- Prospect Park YMCA (357 9th
  St) and Park Slope Armory YMCA (361 15th St) are two GENUINELY DIFFERENT real branches four blocks apart,
  so collapsing the five would have destroyed a real location; one of the five was a card mashing both
  branches together, resolvable by deletion rather than split since both children already existed.
  Conclusion recorded: for any domain with a known duplicate, sweep the domain rather than waiting for the
  oldest-first queue, which would have taken ~11 more batches and likely mis-assigned canonical along the
  way. See "Batch 37/16..." above.
- v83 (2026-08-07): batch 38/10 (cards 378-387) complete. 6 real entities corrected, 2 mashup/duplicate
  cards terminal-ed (Launch Math "Upper East/West Side" -- both real centres already had their own cards;
  Manhattan Kickers, 34th duplicate), and Yombu New York quarantined as a NEW shape of physical-only
  failure: a real, funded kids-party booking MARKETPLACE whose entertainers travel to the family's own
  event -- failing both the aggregator/intermediary rule and the no-fixed-venue rule at once (the
  entertainers it books may be real and listable; the marketplace is not). Also the 3rd instance of the
  `"Near Manhattan priority zones"` internal-jargon leak in `neighborhoodGuess` (after City Treehouse b14
  and apple seeds b36) -- now systematic enough to warrant a targeted grep in the main app. Second
  consecutive batch where a multi-location mashup resolved by DELETION rather than `POST /split`, because
  the children already existed: check for existing children before reaching for the split tool.
  See "Batch 38/10..." above.
- v84 (2026-08-07): batch 39/10 (cards 388-397) complete. 4 stale `low_source_trust` blockers cleared, 6
  already-correct cards touched. First real use of the batch-35 amendment: Sweat FC is a real Brooklyn club
  sourced to a third-party site (`prospectplaces.com` rather than `sweatfc.com`) -- the same "real entity,
  weaker source" shape that caused the batch-29/35 reversal -- so the `normalizedTitle` lookup was run
  BEFORE concluding, confirmed no correctly-sourced sibling exists, and the finding was recorded as a
  genuine re-source opportunity rather than a duplicate. Also a useful confirmation that earlier cleanups
  landed correctly: Brooklyn Italians SC (seed card terminal-ed in b27) and Manhattan Youth After-School
  Programs (umbrella terminal-ed in b34) both surfaced intact and correct -- the real cards survived and
  the synthetic/umbrella ones are what disappeared. See "Batch 39/10..." above.
- v85 (2026-08-08): batch 40/25 (cards 398-422) -- the per-domain sweep generalized from "hosts with a
  known duplicate" to EVERY host in the queue; 14 queue cards pulled in 11 siblings. 6 real entities
  confirmed/corrected, 13 terminal, 6 quarantined. Three new patterns. (1) **Token collision**: a card
  sourced to `camp.com` (the retailer CAMP) actually names Camp Kidville at Kidville UWS, 205 W 88th St --
  a fourth wrong-domain shape and the only one where BOTH companies are real and the card names the right
  one. It reads exactly like a fabricated location (CAMP's sole NYC store is in Flatiron), so quarantining
  on the domain's content would have removed a real business; caught only by searching the card's own named
  entity. (2) **A franchise's bare root domain as `sourceUrl` predicts a defect**: all 5 root-domain cards
  this batch were defective, each either a borough-level duplicate of one real center or a fabricated
  location -- unsurprising, since a root domain carries no location evidence, so the borough was inferred.
  One fetch of each brand's own location directory resolved all five. (3) **Fabrication in the TITLE**:
  "CompleteBody Kids / Kids Sports NYC" welds a real adults-only gym brand to a second name its source never
  mentions and prefixes it "Kids" -- every prior catalogued fabrication was in a location or category field,
  not the field a family reads first. Process: `reason` AND `source` are both mandatory on every update
  call, and `sourceUrl` is not writable on `contentCards` (re-source findings recorded in `terminalReason`
  instead). See "Batch 40/25..." above.
- v86 (2026-08-08): batch 41/46 (cards 423-468) -- the all-hosts sweep compounded: 16 queue cards pulled in
  30 siblings across 16 domains, only 3 hosts had a single card. 17 canonical/corrected, 24 terminal, 3
  quarantined. The batch-40 root-domain rule is now also a **canonical-selection rule**: SwimJim's 8 cards
  split cleanly into 4 with a real per-location path (all correct) and 4 with the bare root (all duplicates
  or location-less chain cards), and the same held on four other hosts -- so when a cluster contains both,
  the per-location card is canonical, no judgement needed. New pattern: the **program-not-a-location
  duplicate** ("...Kids", "...Birthday Parties", "Basketball Foundations"), 7 of the 24 terminals, whose
  tell is that the differentiating token is an activity/audience qualifier rather than a place. Also
  generalized the split guidance: three clusters had surplus vague cards AND real locations with no card, so
  the surplus was **retitled onto the missing location** (MatchPoint → Coney Island 2781 Shell Rd +
  Bensonhurst 9000 Bay Pkwy, closing a deferred split candidate with no `POST /split` call; Private Picassos
  → Clinton Hill 293 Grand Ave; Asphalt Green → Battery Park City 212 North End Ave). Its limit stated
  explicitly: NOT applied to SwimJim's or Brooklyn BJJ's surplus, where no card identifies which real site it
  means -- retitle only onto a location the evidence names. One blocker deliberately left in place (DNA
  Learning Center's `missing_schedule` is a real gap, not a stale premise). See "Batch 41/46..." above.
- v87 (2026-08-08): batch 42/29 (cards 469-497) -- 14 queue cards, 15 siblings, 14 hosts. 12 canonical or
  corrected, 12 terminal, 5 quarantined, 2 blockers deliberately kept. The batch-41 blocker-premise rule
  **discriminated on its first outing, inside a single batch**: 12 `low_source_trust` blockers cleared
  because they sat on the business's own official domain (premise false), 2 kept because the source really
  is a third-party class directory, `activityhero.com/biz/...` (premise true) -- the tempting shortcut
  "confirmed real, therefore clear everything" would have marked two directory-sourced cards fully
  trustworthy. New detection heuristic, visible without fetching anything: **several cards with DIFFERENT
  business names sharing one identical `sourceUrl` is an aggregator page**, not a duplicate cluster (where
  the names match too). `funclubs.com/camps` carried three unrelated names and turned out to be both an
  aggregator of independent providers AND a Georgia operator (East Cobb, Marietta) -- a second sighting of
  the Georgia-camp-company shape, with one of the three already caught in an earlier pass, confirming the
  sweep finds in one step what the queue finds in three. New sub-case of domain squatting: `hiartkids.com`
  now serves an Indonesian lottery-prediction site, and unlike Urban Dunes the business could NOT be
  confirmed still operating anywhere else, so it was quarantined -- squatting alone says nothing about the
  entity, but failing to find the entity elsewhere does, and a live card linking a family to a gambling site
  is not neutral while that stays open. Also two more root-domain confirmations (FasTracKids' `/ftknyc/`
  page names exactly two Manhattan centers, exposing two fabricated "FasTracKids Brooklyn" cards; Oasis
  split one per-location canonical from two root copies) and one exactly-one-answer correction (Brooklyn
  Dance Conservatory: claimed Bay Ridge, has precisely one studio at 497 Carroll St, Carroll Gardens).
  See "Batch 42/29..." above.
- v88 (2026-08-08): batch 43/32 (cards 498-529) -- 14 queue cards, 18 siblings, 14 hosts. 14 canonical or
  corrected, 12 terminal, 6 quarantined. The **program-not-a-location duplicate** named in batch 42 is now
  the most common cluster member (7 of 12 terminals), so it is promoted to the FIRST check in any cluster:
  read the titles, and any card distinguished only by an activity or audience token ("Birthday Parties",
  "Kids", "Youth", a sport name) is a duplicate before any research happens. VITAL Climbing Gym showed the
  two rules composing -- both its cards had real non-root paths (`/brooklyn`, `/brooklyn-youth`) so the
  per-location tie-breaker could not separate them, but the program test could. New pattern: **N cards for
  one venue each guessing a DIFFERENT neighborhood** -- Cynthia King Dance Studio had three cards claiming
  Park Slope, Flatbush and Windsor Terrace; the self-contradiction is a louder signal than any single card,
  and the studio's one real address (327 East 5th St, Kensington, on the Windsor Terrace/Flatbush borders)
  explains all three guesses. Contrast the earlier identical-wrong-value finding: identical wrong values
  suggest a shared fallback path, divergent ones suggest a genuinely ambiguous address. Second
  no-fixed-venue cluster and the first at scale: all four Brains & Motion cards quarantined (real company,
  runs inside partner schools, no venue of its own; the Long Island card also out-of-market), plus
  Metropolitan Oval's "Manhattan outreach" -- **"outreach"/"catchment"/"serving X" all name where children
  come FROM, not where the activity IS**. The verify step caught two inconsistencies this batch created
  itself, including a title still reading "Park Slope" after its neighborhood was corrected to Kensington:
  **when a batch corrects a location field, re-read the title.** Two honest non-findings recorded rather
  than papered over (mathschool.com checked for token collision and cleared -- it IS RSM's own domain -- but
  its JS location finder could not be enumerated, so the canonical pick rests on specificity alone; Taste
  Buds Kitchen Brooklyn left blocked because the location claim is exactly what could not be confirmed).
  See "Batch 43/32..." above.
- v89 (2026-08-08): batch 44/25 (cards 530-554) -- 12 queue cards, 13 siblings, 11 hosts. 10 canonical or
  corrected, 9 terminal, 6 quarantined. **Rule ORDER proved load-bearing**: Riverside Park Conservancy had
  five cards for one organization, and one PROGRAM card carried a deeper source path than the winner --
  applying the per-location tie-breaker first would have crowned "Youth Soccer" canonical for having a
  longer URL. A deeper path to a program page is still a program; run the program test first, then use path
  depth among what remains. Retitle-over-split ran twice more, and its **"fewer cards than locations"
  precondition did real work**: Treasure Trunk Theatre has four confirmed locations and only three cards, so
  a card claiming the unsupported "Carroll Gardens" was repurposed onto the real, uncarded Park Slope site
  (179 4th Ave) -- while in the same batch Color Me Mine Park Slope was QUARANTINED instead, because that
  brand's two real NYC studios are both in Manhattan and there was no unrepresented Brooklyn location to
  repurpose onto. **Repurpose when the cluster is short of real locations in the same area; quarantine when
  the claimed area has no real location at all.** New quarantine ground one step beyond no-fixed-venue: the
  **B2B training organization** (Little Flower Yoga certifies educators and clinicians to bring yoga into
  schools -- no children's offering at all, as against Brains & Motion or Bricks 4 Kidz which do teach
  children but lack a venue). Second fabricated Brooklyn location on the colormemine.com host, both on the
  bare root. See "Batch 44/25..." above.
- v90 (2026-08-08): batch 45/27 (cards 555-581) -- 12 queue cards, 15 siblings, 12 hosts. 11 canonical or
  verified, 10 terminal, 6 quarantined. **A batch-42 open item closed itself**: Brooklyn Crescents was left
  blocked with "the fix is a re-source, not a clearance" and an unknown target; the club's own domain
  surfaced in this batch's queue, so the directory-sourced card became an ordinary duplicate. A recorded
  re-source opportunity is a bet the better source is somewhere in the pool, and the per-domain sweep
  collects it -- worth probing the entity's own domain by `sourceHost` on the spot when leaving a card
  blocked for want of a source. The batch-44 **program-before-path ordering** applied cleanly on first
  re-use (Movement Gowanus: two `/gowanus/climbing/youth-...` cards vs one `/gowanus/`; depth alone would
  have picked a program page), and the verify pass caught the follow-on -- the new location card still
  carried the title "Movement Gowanus Youth Programs". **When a card's ROLE changes, re-read its title**, the
  mirror of batch 43's Kensington case. New negative control: a sport/domain mismatch ("NYC Skyline Flag
  Football" on nycskylinebasketball.com) is NOT a token collision when the entities are the same
  organization -- filed next to the Goethe-Institut foreign-TLD control. Third and fourth no-fixed-venue
  clusters (Prep Academy Tutors, in-home/online; Kids in the Game, school-based -- one card literally titled
  "PS 29 Brooklyn", i.e. named after someone else's building), and a second B2B-training-organization
  quarantine (Bent on Learning) on the same school-yoga subject matter as Little Flower Yoga, suggesting a
  small recurring cluster rather than a one-off. See "Batch 45/27..." above.
- v91 (2026-08-08): **cards 201-500 continuation COMPLETE** -- 581 card records resolved across batches
  21-45, target passed during batch 42 and the sweep run to the end of batch 45 rather than stopped
  mid-host. Retrospective added above. Headline: the unit of work changed from the card to the DOMAIN, and
  that is what made duplicate structure visible at all -- an oldest-first queue reviews one card at a time
  and nothing on a card reveals that its business has six siblings. Batches 21-39 averaged 10 cards;
  40-45 averaged 31, because the sweep pulls siblings in. Six mechanical rules now do most of the deciding
  (program-not-a-location; per-location source beats root; program test first; blocker-premise not
  card-reality; retitle over split; retitle only onto an identified location). Reality-check grounds grew a
  tier: no-fixed-venue went from one case to five clusters and spawned the stricter B2B-training ground.
  Four wrong-domain shapes are now distinguished with two negative controls, and the deciding move in all of
  them is the same -- search the card's named ENTITY before ruling on its domain. Limits recorded honestly:
  the counter's unit changed mid-run, six businesses were left with recorded location gaps rather than
  guesses, two blockers deliberately kept, `sourceUrl` remains unwritable so re-source findings are notes
  only, and the targeted off-topic sweep of the oldest PUBLISHED records was NOT run and remains open.
- v92 (2026-08-08): two bridge capabilities added, and the standing PUBLISHED sweep started.
  **`contentCards.sourceUrl` is now writable**, with `sourceHost` DERIVED from it rather than settable --
  the derivation is the point, since the per-domain sweep groups clusters by host and a card whose host
  disagreed with its URL would vanish from its own cluster. This turns every "real entity, wrong source"
  note recorded across batches 40-45 from prose into an applyable fix. **`offset` added to the rows
  endpoint** so a full-pool sweep can read WITHOUT writing; previously the only way past the oldest N rows
  was to touch them. Both are committed but INERT until the branch merges, because production deploys from
  `main` -- verified by probing the deployed bridge, which still rejects `sourceUrl`. 167 tests passing.
  **The targeted off-topic sweep of PUBLISHED cards was then started** (pool: 908): 50 cards screened, 12
  defects resolved, and **zero off-topic contamination found** -- the defect the sweep was created to hunt
  does not appear to concentrate in the published pool, which contradicts the assumption behind the
  original recommendation. It found marketplace/no-fixed-venue providers and duplicate clusters instead.
  Key methodological finding: **screening page-by-page reproduced the order-dependence the per-domain sweep
  exists to remove** -- page 1 marked two cards clean whose duplicate twins sat on page 2; group by
  `sourceHost` before judging. Also a new tension resolved: a program-not-a-location card whose only
  sibling was already quarantined would have stranded a real business at zero cards, so it was retitled
  onto its one confirmed address instead of retired. See "Targeted sweep of PUBLISHED content cards" above.
- v93 (2026-08-08): reference-host audit. **NOTE: this supersedes v92's "zero off-topic contamination
  found" -- that held for 50 cards and did not survive contact with the rest of the pool.** Method first:
  **`filter` accepts MULTIPLE keys, so partitioning by `state` x `boroughGuess` x `categoryHint` reads the
  pool without writing** -- ~120 combinations harvested 980 distinct cards and 557 distinct hosts
  read-only, where hand-guessing ~85 hostnames had found 9. Partition to enumerate; do not guess. **40
  cards resolved from one root cause**, now precisely diagnosed: the first word of the business name was
  resolved to whatever site ranks for that word. merriam-webster.com proves it -- seven cards sourced to
  dictionary DEFINITIONS ("Sweet" -> /dictionary/sweet, "Prospect" -> /dictionary/prospect, "Field" ->
  /dictionary/field). Wikipedia took proper nouns, youtubekids.com took "Kids", nytimes.com took "NY". 15
  terminal, 12 repairable with re-source targets, 8 quarantined. Separately: **the batch-19 "Psychology
  Today" fix had addressed one instance of a systematic pattern** -- five more identical cards were live and
  PUBLISHED, one per NY county search page, all titled after the directory itself. When a defect is
  structural to a source, query the host rather than fixing the one card you found. See "The reference-host
  audit..." above.
- v94 (2026-08-08): the duplicate backlog is now measured and being worked largest-first. The full-pool
  cluster scan (556 hosts, 0 failures) found **199 hosts with more than one live card, covering 684 live
  cards, 87 of them with 2+ cards at `PUBLISHED`** -- a countable queue, not an anecdote. Seven clusters
  resolved: **43 cards audited, 27 live cards reduced to 7 canonical**, with **4 cards repurposed onto real
  locations that had no card at all** (Penguin City's UES/Midtown/Riverdale pools, Ferox's DUMBO park).
  Method: fetch the operator's own site, read its location list, match cards to locations -- all seven were
  settled by the homepage or footer alone. New findings: **every wrong location guess in all seven clusters
  erred toward the fashionable core** (a Bronx pool, a Sunset Park clubhouse and a DUMBO park were each
  missed by every card in their cluster), so the locations a cluster is missing are predictable; **a
  per-location-looking path can point at a rented venue** (`/summer-camp-uws/` names a real address that
  belongs to the Calhoun School, not to The Art Farm) -- run the program test before the path-depth
  tie-breaker and ask whose building it is; **precision in a wrong claim is an aggravating factor** ("Region
  702" and "Coney Island Gymnastics" were quarantined while their merely-vague siblings were retired); **the
  neighbourhood can be derived from the brand's own name** ("Prospect Gymnastics" -> "Prospect Heights"),
  the token-match bug reappearing outside the sourceUrl field; and **the literal pipeline token "prospect"
  is leaking into public titles** on five known cards, two of them PUBLISHED with zero blockers. Also
  resolved: leagues playing on public fields (Brooklyn AYSO, Gjoa) are kept, not caught by the
  no-fixed-venue prohibition, which exists for businesses with no location of their own at all. Remaining:
  192 clustered hosts, 80 with 2+ published. See "Working the duplicate backlog by cluster" above.
- v95 (2026-08-08): cluster backlog tranche 3 -- six more clusters, **28 cards audited, 28 live cards
  reduced to 15**, and **11 repurposed onto real uncarded locations**, nearly as many as were retired.
  Running total: **13 clusters, 71 cards, 55 live cards down to 22**. Headline: **Physique Swimming resolved
  7 cards onto 7 real pools with nothing retired** -- the largest single repurpose yet, possible because the
  operator names every site by its host venue and the existing cards covered only two of the seven. That
  cluster also sharpened the rented-venue rule from last tranche into a usable test: **ask whether the
  operator runs an ONGOING PROGRAMME at the address, not whether it owns the building** -- The Art Farm's
  eight-week camp rental was retired, Physique's year-round host pools were all kept, and a swim school
  without its own pool is the normal model for the trade. New evidence on the neighbourhood field:
  **PlayGroup NYC had three byte-identical cards -- same title, same sourceUrl -- differing only in claiming
  three DIFFERENT fabricated Bronx neighbourhoods** (Allerton, Bedford Park, Baychester) for an operator
  located in Park Slope and Greenwich Village. Identical input, three divergent outputs: stronger than the
  earlier shared-wrong-default signal, and evidence the neighbourhood is not derived from the page at all.
  Also: **three of four Brooklyn United Academy cards misname the club, one of them with a different real
  company's name** ("United Soccer Academy"), which would misdirect a family to the wrong provider; a
  **second confirmation that the program test overrides path depth** (Kidville's correct card is the
  shallowest of four, the other three being programme pages under the same `/westside/` branch); and the
  fashionable-core bias again, twice (Fit4Dance's Flatbush studio labelled Crown Heights on all four cards;
  Physique's two Bronx pools uncarded until now). Remaining: 186 clustered hosts, 74 with 2+ published.
- v96 (2026-08-08): **the letsgobaby.co cluster -- 795 restaurants ingested as children's activity cards**,
  the largest single defect found in this repo's history. Let's Go Baby is a directory of family-friendly
  NYC restaurants; one backfill run turned its whole listing into content cards, with the CUISINE in
  `categoryHint` -- 51 of its 53 distinct values are cuisines, including Bar, Brewery, Steakhouse and Diner.
  None was ever PUBLISHED, but 684 sat in DISCOVERED with the pipeline working toward publishing them. All
  795 set to `BLOCKED_TERMINAL` (structural to the source, per the Psychology Today precedent), including 11
  earlier terminals whose `terminalReason` was empty and has been backfilled. Owner directive framing the
  outcome: **the site should be registered as a DISCOVERY SOURCE, a place to look for candidates, not a host
  whose pages become cards.** **Methodological correction, and it matters for every count in this document:
  partition-based enumeration silently UNDERCOUNTS.** Four levels of partitioning (state x borough x
  neighbourhood x category) reported 706 cards with zero capped partitions -- which read as complete, and was
  not; retiring those and re-querying returned 25 more, and four further loop-until-nothing-new rounds were
  needed to reach 795. Any partition returning exactly 25 rows has hit the limit cap and been truncated. The
  reference-host audit's "980 cards / 557 hosts" and the cluster scan's "199 hosts / 684 live cards" are both
  LOWER BOUNDS for this reason. Partition to find clusters; loop-until-nothing-new to finish them. Also
  visible in the same cluster: 11 titles ending in the literal token `: family_service_review_required`, and
  several cards titled just "Brooklyn" or "Manhattan". See "The letsgobaby.co cluster" above.
- v97 (2026-08-08): cluster tranche 4 -- three hosts, 17 cards, one deliberate negative control.
  **`forum.lowyat.net` (6 cards, all quarantined)** is a Malaysian consumer-tech forum in Kuala Lumpur; five
  cards carry its own tagline as their title and one is named after a sub-forum -- and **the pipeline gave
  all six New York boroughs**, inventing a location for a site on the other side of the world, corroborating
  the PlayGroup finding that the location fields are generated rather than read. **`activityhero.com` (9
  resolved)** is a real children's-activity marketplace, so the owner's directory ruling splits three ways
  here rather than applying wholesale: 2 terminal (cards that ARE the directory's own browse pages and say so
  in their titles), 6 repairable (cards naming a specific provider but scraped off a multi-provider browse
  page -- a named entity exists to find, so not terminal), and **1 that was LIVE at PUBLISHED** ("SpeakItaly
  NYC Kids", a real Italian-for-children provider sourced to its ActivityHero listing) moved off PUBLISHED
  with the re-source target recorded. **`laparks.org` (30 cards, 28 left alone)** is the negative control and
  matters as much as the finds: a 30-card cluster on a municipal .org looks like the letsgobaby shape but is
  one card per real LA Parks facility on a legitimate LA-tenant source -- the one-card-per-location rule
  working correctly at scale. Only the two cards sitting on the department's own homepage were retired.
  **Cluster size alone is not evidence of a defect.**
- v98 (2026-08-08): cluster tranche 5 -- five clusters, every one with cards live at PUBLISHED. **33 cards,
  33 live down to 10, 6 repurposed onto real uncarded locations, 7 quarantined for being in another state.**
  Worst find: **`hoopheaven.com` is a NEW JERSEY business** -- its own homepage title says "New Jersey's
  Premier Basketball Facilities", its three sites are Whippany, Bridgewater and Waldwick -- and all seven
  cards claimed Brooklyn or Manhattan, **two of them live**, one titled "Hoop Heaven NYC Manhattan". The
  out-of-market pattern at seven cards and, for the first time, on the public site. **The one-real-answer
  test split two superficially identical live cards**: Goldfish's wrong "Brooklyn Heights" was CORRECTED to
  Gowanus (exactly one real Brooklyn school), while Take Me To The Water's wrong "Park Slope" was REPURPOSED
  onto 228 Duffield St (three real Brooklyn pools, so no single correction existed) -- a correction and a
  reassignment are different moves and worth keeping straight. Take Me To The Water is repurposing at its
  most productive: one correct card in, five out. Its three Queens pools were deliberately left uncarded
  because two share a street and choosing would be a guess. Fashionable-core bias a third and fourth time
  (Goldfish's Astoria school uncarded among ten; TMTTW's Midwood pool uncarded among six). Borough-taxonomy
  gap confirmed a fourth time, and **the data is already violating the type** -- three cards carry
  `boroughGuess: "Long Island"` and one carries `"NYC / Long Island"`. Also: **a pre-opening location is not
  a location** -- Goldfish's UWS Broadway school is in pre-registration and was deliberately not carded.
- v99 (2026-08-08): cluster tranche 6 -- the three public-library systems, **118 cards audited, 113
  deliberately left alone**. One card per real branch on that branch's own URL with the correct borough:
  second confirmation, after laparks.org, that **cluster size is not evidence of a defect**. Five were wrong.
  **Both of NYPL's only live cards** are the system's children's-programme INDEX page rather than a branch,
  and one of the two carried `boroughGuess: "Brooklyn"` -- **a borough NYPL does not serve** (Brooklyn Public
  Library and Queens Public Library are legally separate systems). So the only NYPL card a family could see
  was a programme index attributed to the wrong library system, while 61 correct branch cards sat unpublished
  behind it. Both retired. **New title-defect shape: a raw HTML tag in the public title** -- three cards
  carry the literal `<br>`, scraped out of branch-list markup. A scan of 742 titles found exactly these
  three, so it is rare rather than systemic, and all three sit on library branch lists (one scraper path).
  **The parentheticals mattered more than the markup**: two of the three branches are closed for renovation
  per their own systems' lists and were set BLOCKED_REPAIRABLE, which completes a lifecycle family now seen
  at three points -- pre-opening (Goldfish UWS), temporarily closed (these), permanently closed (City
  Treehouse). The third is operating from a temporary location and was kept with that fact moved out of the
  title into the record.
- v100 (2026-08-08): cluster tranche 7 -- six more live clusters, **22 cards, 22 live down to 7**, one
  repurposed (The Craft Studio's real Tribeca studio at 176 Duane St, which had no card, taking over from a
  "Brooklyn Pop-Ups" card for an operator with no Brooklyn studio). **Second confirmed instance of a cluster
  carrying a DIFFERENT REAL COMPANY'S name**: `manhattankickers.org` had a live card titled "Lil' Kickers
  Manhattan", a national franchise unconnected to Manhattan Kickers Soccer Club -- same shape as "United
  Soccer Academy Brooklyn", so it is now a pattern: when a cluster carries several names for one operator,
  check whether any of them is somebody else's. **Brooklyn Robot Foundry is the hybrid rule working as
  intended** -- two cards had the literal word "mobile" in `neighborhoodGuess`, which reads like the
  prohibited no-fixed-venue case, but the operator has a real Gowanus studio (98 4th St) plus an outreach
  model, so the card stays and the mobile framing goes; its Manhattan franchise TERRITORIES were explicitly
  not treated as addresses. New small observation: **a delivery model can occupy the neighbourhood field** --
  "mobile", "NYC-wide", "Multiple Brooklyn" are categories of answer rather than wrong answers. Also: all
  four `brooklynsportsclub.com` cards are named after programmes and **not one names the business**, so the
  canonical had to be retitled from scratch; and Riverside Hawks moved from "Upper West Side / Harlem" to
  Morningside Heights, where the Stone Gym actually is -- **the community a programme serves and the address
  it operates from are different facts.**
- v101 (2026-08-08): cluster tranche 8 -- seven clusters, **21 cards, every one live at PUBLISHED before
  this pass, down to 8**, two repurposed. **`riverside.com` is podcast/video recording SaaS** and carried
  three live cards, another instance of the token-match source bug ("Riverside" -> whatever ranks for it) --
  and it surfaced a NEW SUB-SHAPE: **two of the three duplicate a card that already exists, correctly
  sourced, on `riversidehawks.org`**. The token-match bug therefore does not only mis-source cards, it
  manufactures CROSS-HOST duplicates of correct ones -- which a per-domain sweep structurally cannot see,
  since the pair sits on two different hosts; only searching the entity finds it. Those two are terminal
  rather than repairable because the correctly-sourced card already exists. **`musictogether.com` is the
  FRANCHISOR's own site** -- a root-domain card with no location, one level up from the franchise case:
  "Citywide NYC" terminal, UES/UWS repairable pending identification of the specific licensed centre. Two
  more repurposes onto flagships nobody had found: Educational Alliance's three programme-named cards became
  the Manny Cantor Center and the 14th Street Y, and Kings Bay Y's duplicate North Williamsburg card became
  its actual MAIN SITE at 3495 Nostrand Ave, Sheepshead Bay -- fashionable-core bias again, the satellite
  found twice and the flagship not once. Also: **a division is not a location** (Kaufman's Lucy Moses School
  and Merkin Hall are one building; Mark Morris's "Kids" and "Student Company" are programmes inside one
  address).
- v102 (2026-08-08): cluster tranche 9 -- seven clusters, **21 cards all live at PUBLISHED, down to 12**,
  one repurposed, and **the first fully-correct cluster of the entire sweep**: `treasuretrunktheatre.com`'s
  three cards are one per real location, correctly named and located, and nothing was changed. It is also
  the first cluster with FEWER cards than locations (TT South Slope, 408 7th Ave, has none), so unlike every
  other cluster here there is no surplus to repurpose -- a genuine POST /split candidate, and the same gap
  an earlier pass deferred. **Modern Martial Arts is the cleanest repurpose yet**: the surplus was a COMPOUND
  card ("Upper West Side / Tribeca") duplicating two already-carded schools while the third, UES at 220 E
  86th St, had none -- the first time a compound card was a perfect repurpose target rather than just a
  duplicate. **Checking before retiring saved a real studio**: The Painted Pot's homepage names only Park
  Slope, so its Carroll Gardens card looked fabricated; 339 Smith Street is a genuine operating second
  studio. A homepage naming one address is not evidence the others are fake. **`superdupertennis.com` calls
  itself mobile in its own page title** and has no courts -- its Brooklyn cards name a borough with no venue
  and were retired, the Manhattan one is repairable pending a specific site with a continuing schedule
  (noting Asphalt Green, one of its venues, is already carded in its own right). Two more broken live titles:
  a card titled simply **"Summer"** and one reading "Programs Kids Programs in Kingsbridge Bronx".
- v103 (2026-08-08): cluster tranche 10 -- five clusters, **15 cards, 10 live before and 8 correct after,
  three repurposed and ALL THREE INTO QUEENS**: Movement's Long Island City gym, NYMAA's Astoria and Little
  Neck academies, none of which had a card while the surplus cards claimed "Brooklyn" twice and "Manhattan"
  once. **NYMAA is the sharpest fashionable-core case yet** -- four real locations, none in Manhattan, and a
  LIVE card claiming Manhattan. **Brooklyn Clay Industries corrects a myth about the taxonomy**: its cards
  said Gowanus and Bushwick, the studio has been in the Brooklyn Navy Yard since 1995, and `"Navy Yard"` IS
  in this platform's Brooklyn vocabulary -- the vocabulary was fine, the guess was just wrong. Sixth card
  found carrying the trailing `" prospect"` pipeline token. One deliberate NON-correction recorded: Five
  Points Academy's neighbourhood was left at borough grain because 148 Lafayette St sits on the
  SoHo/Little Italy/Chinatown boundary and sources disagree -- sharpening it would be a guess dressed as a
  fix, so the street address went into the record instead.
- v104 (2026-08-08): cluster tranche 11 -- three clusters, 12 cards, three repurposed onto real campuses.
  **`steveandkatescamp.com` is the case where the rented-venue rule had to cut the other way.** All five of
  its NYC campuses are school buildings rented for the summer -- the same shape that retired The Art Farm's
  camp card. The difference is what retiring costs: The Art Farm owns 431 E 91st St and is already carded
  there, so its camp cards were surplus; Steve & Kate's has no venue of its own anywhere, so retiring these
  would remove a real operating camp from the pool entirely. **The sharpened rule is two-part: does the
  operator run a continuing programme at this address -- and if not, does the operator have any other card?**
  A seasonal-only operator's rented campus IS its real location; a year-round operator's seasonal rental is
  not. Also: two more division-not-a-location clusters (92NY's dance centre, basketball and Parenting Center
  are all 1395 Lexington Ave, and none of the three cards carried the institution's own name; City Parks
  Foundation's four cards are two duplicate pairs of citywide programmes). And a **deliberate
  non-sharpening**: City Parks Foundation keeps `neighborhoodGuess: "NYC-wide"` because its office is not
  where children go and the programmes really are citywide -- **a vague value is sometimes the honest one,
  and the fix is a per-park split, not a better guess.**
- v105 (2026-08-08): started a second 100-card mass-enrichment pass. Cards 1-10 found that another agent
  is already concurrently working this same queue (confirmed: `cc-854c0e40e153afb2891ec461`,
  "Replacement Parts - Step2," and its sibling provider record were already correctly fixed under a
  different `lastReviewedBy` before this pass reached them) — expected and fine given the deterministic
  oldest-first selection re-checks live state before every write. Four new findings: `kind: "repair"`
  cards should be filtered out of selection entirely (`&filter={"kind":"content"}`) rather than reviewed
  one at a time, since they're the pipeline's own retry-bookkeeping, already terminal, never live; a
  `local_ai_enrichment_failed` blocker can be a systemic memory-pressure issue shared across many
  consecutive cards, not a per-card problem (visible as a run of `categoryHint: null` cards from the
  same discovery window); a `sourceUrl` can be mangled to the wrong page entirely while the intended
  target is still visible in the card's own `evidenceSources` (West Side YMCA → Wikipedia's
  disambiguation page for "West"); and a real entity can be genuinely out of scope for this catalog when
  it's tied to school enrollment rather than open registration (a PSAL varsity team). Also documented
  the discipline of saying "not confirmed" and leaving a field alone rather than guessing either
  direction, when independent verification is genuinely inconclusive (Kano Martial Arts's Brooklyn claim,
  which could not be confirmed OR refuted with the tools available).
- v106 (2026-08-08): cards 11-20 of the second mass-enrichment run. Two more wrong-borough hallucinations
  confirmed and fixed (NY Gauchos: fabricated "Manhattan/Brooklyn" → really Bronx-only, Mott Haven; City
  Ice Pavilion: fabricated "Brooklyn/Queens" hedge → really Queens-only, Long Island City), alongside two
  cards where the exact same suspicious `"Manhattan/Brooklyn"`/`"Multiple"` pair turned out to be
  genuinely accurate (NORY, Lil' Kickers) — the pair itself isn't a reliable tell either way, verify each
  instance. Two more confirmed wrong-source-no-real-org-found cases (Eleven United NYC → a restaurant;
  SABA NYC Basketball → the NBA's own Knicks page), a third wrong-source case with a real alternative
  found but unconfirmed NYC presence (The Jam Cats), and a new wrong-kind variant: a real entity that's
  simply not the kind of thing this catalog is for (The Mom Club — a national parent community, not a
  local kids' activity) alongside another aggregator/directory-as-single-entity case (a NYC government
  press release about a citywide summer-activities portal, not a bookable activity).
- v107 (2026-08-08): cards 21-30 of the second mass-enrichment run. With 11 total instances of the
  `"Manhattan/Brooklyn"` boroughGuess pattern now checked, the single most common specific outcome is
  neither "accurate" nor "flatly fabricated" — it's **undersold scope**: three genuinely-citywide
  programs (NYJTL Community Tennis, NYC Volleyball Academy, CityParks Track & Field) had their real
  5-borough footprint narrowed to just two boroughs. Corrected all three to `"Citywide"`. Two more
  3-borough programs (Physique Swimming, SocRoc) got the more conservative `"Multiple"` correction since
  a full 5-borough footprint wasn't confirmed. One flatly-wrong case in the opposite direction (Sports
  United NY — a real Brooklyn-only org per its own site, with a fabricated Manhattan claim added).
  Practical takeaway added to the SOP: confirm a multi-location org's *complete* real footprint, not just
  *some* real presence, since undersold/overclaimed/accurate can otherwise look identical from a single
  quick source check.
- v108 (2026-08-08): **PR #2 merged and deployed — the maintenance flow resumes with re-sourcing actually
  working.** `contentCards.sourceUrl` is writable in production and `offset` is live; verified against the
  deployed bridge, a re-source returns the new URL plus a derived `sourceHost` plus a recomputed
  `fingerprint`/`normalizedTitle`. **Two guardrails fired and both were right.** The bridge REJECTS
  `state: "PUBLISHED"` -- which caught a real over-reach: SpeakItaly NYC had been pulled off PUBLISHED by
  this loop earlier the same day purely for its source, and once re-sourced, restoring it felt like
  completing a repair; the bridge's position that publishing goes through the main app's gate is better,
  **even when the loop is undoing its own restriction**. Set REVIEW_READY instead. And **all 16
  globally-oldest records are `kind: "repair"` stubs** on `internal://` URLs -- the other session's v105
  finding reproduced exactly; step 1 must filter `kind: "content"`. **The 10 oldest real cards** all come
  from one 2026-06-28 run targeting multi-site and itinerant youth sports: 4 sharpened onto real locations,
  4 retired (a Parks Department programme index, a franchise territory, a CityParks registration page, a
  duplicate chain parent whose sibling was already split), 1 blocked, 1 deliberately left alone. Circus
  Warehouse carried **four defects on one card** (the seventh `" prospect"` token, a `/pro-program` source,
  "Multiple" for a single venue, and a Manhattan borough for a Queens address) and is the best demonstration
  of the merged capability. New shape named: **a card asserting a children's offering its own source does
  not support** (NYC Footy presents as an adult league; the card claims "Kids Clinics") -- blocked, not
  quarantined, because the check belongs before a family sees it.
- v109 (2026-08-08): sovereign maintenance run, 5 cards (11-15 of the 2026-06-28 discovery run). **2 fixed,
  2 blocked, 1 terminal, 1 deliberately left alone.** Headline: **`zing.cz` -- a CZECH VIDEO GAMES SITE --
  was the source for "Zing! Kids Fitness", the clearest token-match case yet and the FIRST ONE FULLY
  REPAIRABLE.** Entity-before-domain stopped it becoming a quarantine: Zing! for Kids is a real NYC
  children's fitness business at 1732 1st Ave, and its own site zing-kids.com says "Upper East Side Studio".
  Re-sourced, retitled and located -- every earlier token-match card could only carry its target in prose.
  Also: a **third programme-index card from this same run** (NYCFC's /youth/programs, after the NYC Parks
  index and the CityParks registration page) -- the run reliably scraped programme hubs rather than venues,
  which is a run-level signature, not three coincidences. A **third name-collision instance** ("Samba Soccer
  Schools NYC" on kidsupersambaac.com, where Samba Soccer Schools is a separate real brand), now a reliable
  pattern. The Jam Cats has **7 of 8 listed locations in New Jersey** with no published Manhattan address --
  re-sourced off /registration/ and blocked, because a borough named in a menu with nothing behind it is not
  a location. And a fourth deliberate non-action, with sharper reasoning: NYC Impact Volleyball's only
  findable address is an administrative office, and **writing it would put a back office into the field a
  family reads as the place to turn up.**
- v110 (2026-08-08): sovereign maintenance run, cards 16-20 of the 2026-06-28 run. Five superficially
  identical cards -- five youth sports orgs, all "NYC-wide" -- took **five different outcomes**, separated by
  one question: does this operator have a venue, and whose is it? **New York Gauchos OWNS its gym** (478
  Gerard Ave, "The Mecca") -> Mott Haven, Bronx, and is the cleanest card in the whole run. **Dribbl rents
  but runs a continuing multi-season programme** at the Dalton PE Center, 200 E 87th St -> Upper East Side,
  the Physique test applied without hesitation; its UWS/Brooklyn/Stuy Town sessions deliberately not carded
  for want of a published address. **PAL is wrong precisely because it is big**: centres across all five
  boroughs, a per-borough Locations menu, and a card that is the homepage at "NYC-wide" whose only address is
  a head office -- one card per centre is the right answer, so a genuine split candidate; fourth
  programme-index card from this one run. **Volo Kids adds a variant, a national nonprofit's CITY LANDING
  PAGE** -- names no NYC venue, and its only street address is the foundation HQ in Baltimore. And a
  sport-level pattern worth expecting rather than re-diagnosing: **volleyball clubs in this pool publish
  tryouts and no venue** -- NYC Juniors is the second in two batches left deliberately unchanged for that
  reason, after NYC Impact.
- v111 (2026-08-08): **the core system's listing-maintenance spec is adopted into the process.** Recorded in
  full at `docs/listing-maintenance-requirements.md`, with a field-by-field map of what this bridge can
  persist, what it can only note in prose, and what needs core-app schema work (written up as
  recommendation 0b). Adopted from it: the **four verdicts** -- and `needs_human` is the one this repo was
  missing, since every "deliberate non-action" here (five so far) was really an escalation with no name;
  **`confirmed` must name the fields checked**; and **every factual claim carries the URL and date it was
  read on**. Its headline finding is one this bridge cannot fix and must not paper over: **97.3% of the
  catalog is priced at zero** because the field defaults to `0` and cannot distinguish "free" from "not
  found" -- never infer a price, record it in `terminalReason`. Its top rule, search the ENTITY not the
  domain, is one this repo reached independently; the two worked examples now sit side by side (Camp
  Kidville on `camp.com`, Zing! for Kids on `zing.cz`). **Two corrections to step 1 of the loop, both from
  real drift**: `contentCards` must be filtered `kind: "content"` (all 16 globally-oldest are repair stubs),
  and the cross-collection rule must actually be followed -- one session ran **239 writes without touching
  `providers` once**, and every contact-data and content-quality field the spec cares about exists ONLY on
  `providers`. Also backfilled `categoryHint` on 10 maintenance-run cards after finding it left null on all
  20 despite being writable and named in the standing directive.
- v112 (2026-08-08): **first `providers` enrichment pass** -- the first run of this loop to touch the
  collection where address, phone, email, descriptions and ageRanges actually live, closing the gap recorded
  in v111. Five oldest records, verdicts per the core spec: 4 `corrected`, 1 `should_not_exist`. **Worst
  defect was a phone number**: Kinder Prep Montessori's live record carried a **Nashville, Tennessee area
  code** matching none of the operator's three published numbers -- CLEARED rather than swapped, because an
  empty phone is an honest absence and a wrong phone is an active harm. **Brooklyn Bridge Parents is the
  spec's 1.2 pattern in its purest form -- three identities in one record**: named after a directory,
  sourced to that directory's camps index, described as World Explorers, and reachable at an @makeinspires
  address; hidden and quarantined. **Two age ranges were wrong in the direction that sends a child to the
  wrong room** (Ballet Tech `["6-8"]` for grades 4-8; Mark Morris `["Teens"]` for a school serving ages
  4-18). Brooklyn Preschool of Science's copy said "two locations" and then named three, one of them wrong;
  rewritten and located to the Cobble Hill school, with Park Slope and Brooklyn Heights recorded as split
  candidates. Two process notes: **fixing a record's copy does not re-run its derivations** -- Kinder Prep
  still had nine activityTypes after the enrichment write because `alignActivityTypes()` only fires when
  that field is touched; and **an internal contradiction is fixable with no research** -- Ballet Tech's
  address field said Flatiron while its neighbourhood field said Midtown.
- v113 (2026-08-08): **ten-provider retrospective, and it changed the method.** At 1,087 providers,
  hand-walking is the wrong tool -- ten records bought a catalogue of defect SIGNATURES, and signatures can
  be queried pool-wide. New rule: **walk the queue to learn the shapes, then query the shapes to fix them at
  scale.** Full scan (now possible because `offset` is live): **921 records with no `primaryActivityType`
  (86.4%), 399 with an empty `neighborhood`, 338 whose `address` is a neighbourhood rather than a street,
  284 over the 3-tag cap, 213 with NO phone AND no email, 90 with a non-NY area code, 78 with scraped chrome
  in a description.** Two findings stand out: **35 live records carry an LLM PROMPT as their public
  description** -- *"Extract age or grade evidence from the official program page.."* -- the internal-leak
  pattern in its most severe form yet, an entire field replaced by the pipeline's instruction to itself; and
  **18 give `311`, New York City's government switchboard, as the provider's phone.** The scaled fix: **924
  records re-derived in one pass, taking both the missing-primary and over-cap counts to ZERO**, introducing
  no new facts -- each record's existing tags passed back through `alignActivityTypes()`. The derivation
  already existed and was already tested; what was missing was anyone invoking it. Also recorded: **my first
  run of the scan reported 125 of 1,087 and looked clean**, because it did `except: break` on a transient
  error -- the exact silent-truncation failure this document warns about. A scan needs retries and an
  explicit failed-page list.
- v114 (2026-08-08): **the mechanical sweep -- 1,122 record-fixes across the providers pool, no invented
  facts.** Five defects: no `primaryActivityType` **921 -> 0**, over the 3-tag cap **284 -> 0**, HTML
  entities in copy **87 -> 1**, undialable phone **42 -> 0**, empty `neighborhood` **399 -> 312**. Every
  value written was already in the record, derived by existing code, or removed as unusable. **The phone
  field contained UNIX TIMESTAMPS** -- nineteen records held 10-digit epoch seconds (`1742850639` =
  2025-03-24, `1672214040` = 2022-12-28) in the field a parent dials, plus 18 holding `311`, the city
  switchboard; all 42 CLEARED rather than replaced. **Validity tested by rule, not by denylist**: an earlier
  classifier flagged `212-569-6200 ext. 2274` as broken when it is merely extension-suffixed -- stripping
  extensions then applying NANP structure rescued five real numbers. **The copy gate blocked one write and
  was right to** (a description that decodes cleanly but still contains "skip navigation"), so the sweep now
  retries without the copy fields and records why, letting the other corrections land. `neighborhood` only
  reached 312 because the 87 fixed were those whose OWN address field already named a neighbourhood -- the
  rest need research, which is exactly the mechanical/manual line this sweep exists to draw.
- v115 (2026-08-08): **9 of the 35 leaked-prompt descriptions rewritten by hand** -- the one pool-scan
  finding that cannot be fixed mechanically, since each needs real copy from a real source. Beyond the copy,
  the rewrites recovered: two explicit age ranges stated in words on the operators' own sites (Brooklyn Force
  "AGES 3-14"; NYC Lions "young people ages seven to seventeen"), both previously stored as a single bucket;
  and three real street addresses replacing neighbourhood-only ones (Brooklyn Brainery 190 Underhill Ave,
  UrbanGlass 647 Fulton St, Brooklyn Craft Company 165 Greenpoint Ave). **Three of the nine were written
  deliberately short and cautious**, and that is the point: Big Apple Tutoring publishes no premises, so the
  copy says tutoring is arranged around the student and its stored Harlem neighbourhood is a catchment claim
  rather than an address -- the `venueModel` gap met in the wild; NYC Cyclones publishes no rink, so the copy
  tells the reader to confirm it rather than inventing one; and Yorkville leads on its SCHOLARSHIP programme
  because **price is the field this platform cannot store at all**, so the description is the only place the
  deciding fact can live. 26 leaked prompts remain.
- v116 (2026-08-08): **the remaining 26 leaked-prompt records resolved, and the defect turned out to be
  bigger than the scan that found it.** All 26 are done — 17 corrected/enriched, 6 retired as duplicates or
  franchisor-root-domain cards, 3 quarantined — and the pool now reads **0 occurrences of the leaked prompt
  in any field of any of the 1,087 live provider records**. Four things are worth carrying forward.

  **(a) The "35 records" figure was an undercount, and the reason generalises.** The original scan looked
  only at `shortDescription`/`longDescription`. The same leaked string was ALSO the entire value of
  `recurringPrograms[].timeText` on **48 further records** — including two whose descriptions had already
  been rewritten in the v115 pass, so they read as fixed while still showing a family the pipeline's own
  instruction where the class time belongs. Cleared pool-wide in one scripted sweep (48/48 applied), field
  emptied rather than invented, everything else in each program entry untouched. **A defect found in one
  field is a defect to look for in every field of the same shape** — the scan defines the finding, so a
  narrow scan produces a confidently wrong count.

  **(b) A parent organisation's HEADQUARTERS can overwrite a venue's own address — a new shape.** Prospect
  Park Zoo was filed under *Fordham, the Bronx*. That is not a random miss: 2300 Southern Boulevard, Bronx is
  the Wildlife Conservation Society's organisation headquarters, printed in the footer of every WCS site
  page, and the extraction took the footer instead of the venue. Distinct from the catalogued
  administrative-office rule, which is one business's own back office; here a multi-site parent's HQ
  relocated a completely different site to another borough. Corrected to 450 Flatbush Ave, Prospect Park,
  Brooklyn. Worth checking wherever one parent runs several venues.

  **(c) Exactly-one-real-answer decided three cards two different ways in one batch, as designed.** Sylvan's
  card claimed the Upper East Side; Sylvan has exactly one Manhattan centre (200 W 86th St) — one answer, so
  it was CORRECTED. Eye Level's card claimed Harlem; Eye Level has three real Manhattan centres (East
  Village, Tribeca, UES) and none in Harlem — several answers, so it was QUARANTINED with all three recorded.
  Karate City's card claimed the UES; the dojo is at 525A W 52nd St and a correctly-located sibling card
  already existed — so it was RETIRED as a duplicate rather than corrected, which would have produced two
  cards for one dojo. **Checking for a sibling BEFORE ruling is what turned the third from a correction into
  a retirement.**

  **(d) Two deferred split candidates closed by retitling, no split call.** Treasure Trunk's surplus card was
  moved onto its uncarded South Slope studio (408 7th Ave) and Ferox's onto its uncarded DUMBO playground
  (65 Jay St) — in both cases the operator's remaining locations already had cards and only one was missing.

  Also this pass: `providers.website` made writable (see below); a wrong-area-code phone CLEARED not replaced
  on Irish Arts Center (202/Washington DC on a New York arts centre) while a wrong-area-code phone KEPT on
  Doc's NYC Lacrosse (617/Boston, but published on the operator's own site as its hotline — **a non-local
  area code is not by itself evidence of a wrong number**); a self-contradicting record caught for free
  (Irish Arts Center's `address` said Hell's Kitchen while `neighborhood` said Midtown); and 92NY's four
  program-not-a-location cards reduced toward one canonical venue record at 1395 Lexington Ave, with the two
  outside this batch flagged rather than swept up unchecked.
- v117 (2026-08-08): **`providers.website` is now writable** — the one field on a live record that a family
  literally clicks, and it could be flatly dead while everything else was right. Barking Cat Studio is a real,
  currently operating art studio at 219 Greenwood Ave; its record pointed at `barkingcatstudio.com`, a parked
  "Coming Soon / under construction" page, while the studio is at `barkingcatstudio.net`. Same defect class
  that made `sourceUrl` writable on `contentCards` (real entity, wrong or dead domain), on the collection
  where the consequence is public rather than internal. `sourceUrls` stays read-only — it is the discovery
  pipeline's provenance trail, not a field to curate. Two tests that had used `website` as their canonical
  "not writable" example now use `sourceUrls`, and a new test pins `website` as writable so any future
  narrowing has to be deliberate. **Judge the value by whether it reaches the operator's own site**: never
  rewrite it to a directory listing or aggregator page standing in for the business.
- v118 (2026-08-08): **scraped page chrome cleared pool-wide (10 records), and the sweep for it turned up
  three records that should not be live at all.** With the leaked prompt at zero, the same scan was widened
  to other scraper signatures. Both are now zero across all 1,087 live provider records.

  **The chrome itself** — descriptions that were the source page's own navigation, verbatim: *"Brooklyn
  Botanic Garden Skip to main content Open/Close Menu Visit…"*, *"Breakaway Hoops 4:36 tag --> skip
  navigation"*, *"Color Me Mine Skip to main navigation Skip to main content Skip to footer ---------->"*.
  Rewritten from source, and along the way three duplicate clusters were resolved (Park Slope Day Camp 3→1,
  Breakaway Hoops 3→1, MatchPoint's two records repointed at its two actual clubs).

  **The Long Beach Public Library case is the sharpest instance of a general mechanism.** Its `address` read
  `"570-6685 Send Email Dr."` and its `phone` was `562-570-6801`. Neither is a mangling of a real library
  value: longbeach.gov renders the city's full **elected-officials directory** — every councilmember with
  their phone — on every page. The "address" is the tail of councilmember Tunua Thrash-Ntuk's number
  (562-570-**6685**) with the adjacent words "Send Email" and a street suffix bolted on; the "phone" is the
  **Mayor's office**. Confirmed by fetching a URL that 404s and finding the same directory rendered on the
  error page. **A site-wide navigation block is a field-filling hazard for every record scraped from that
  site**, and the confirmation trick is cheap: if the value still appears on the site's 404 page, it came
  from the furniture, not the content. Both fields cleared, not replaced — the library's own locations page
  404s, so no verified branch address existed to write. Region also corrected from Central LA to Harbor
  (a legitimate LA-tenant record, wrong LA region).

  **Three quarantines came out of the same scan, none of which a chrome sweep was looking for:**
  - **Masttro** — enterprise wealth-management software, live with no blocker, reached this catalogue on the
    token "family" from the industry term FAMILY OFFICE, then given a fabricated Upper West Side location and
    the activity types "Art" and "Music". Found by a scan for descriptions ending in a doubled full stop.
    **Live off-topic contamination is still being found by accident rather than by sweep** — third time now.
  - **Equinox Sports Club "Kids Programs"** — a NEW sub-shape of the adults-only-gym fabrication. CompleteBody
    had nothing child-related at all; this club really does have a "Kids Club", and it is **drop-off childcare
    for members while they train**, listed in the amenities between the spa and the coat check. Searching the
    club's own page for "youth", "junior", "teen", "camp" and "family" returns nothing. **The word "Kids" in
    an amenity name is not evidence of a children's programme.**
  - **Color Me Mine Bay Ridge** — three tells stacked: franchisor root domain, an 818 (California) franchisor
    phone, and real per-studio subdomains (upperwestside/tribeca/newcity.colormemine.com) with no Bay Ridge.

  **Kidville Upper East Side retired, with a caution attached.** A web search asserted Kidville has "Upper
  East Side, Upper West Side, Chelsea, TriBeCa and Park Slope" locations. The operator's OWN location finder
  lists exactly two in North America: Upper West Side (205 W 88th St) and Montclair NJ. **The operator's own
  location list beats a search summary** — the summary was stale marketing copy, and acting on it would have
  kept a fabricated location live.

  **One cheap mechanical duplicate test discovered here:** two Breakaway Hoops records shared an identical
  name and an identical phone number differing only in punctuation (`6467762021` against `646-776-2021`).
  Comparing phone numbers *normalised to digits* would find that whole class of duplicate without research.
- v119 (2026-08-08): **a new mechanical duplicate test — group live providers on the phone number
  NORMALISED TO DIGITS — and it exposed the largest structural finding of the effort so far.**

  **Where the test came from.** Two Breakaway Hoops records had an identical name and the numbers
  `6467762021` and `646-776-2021`. That is a duplicate no title comparison finds and no research is needed
  to confirm. Running the same comparison across the pool: **99 clusters covering 350 of the 1,045 live
  records — a third of the catalogue shares a phone number with another record.**

  **Acted on now: 22 records, all judgement-free.**
  - **9 pure ID-truncation duplicates** in the NYC Parks "Summer Sports Experience" set. Each pair carries a
    byte-identical name AND the same trailing hash, differing only in the id being truncated mid-word before
    the hash (`…-tennis-at-highbridge-recr-8679467c` against
    `…-tennis-at-highbridge-recreation-center-8679467c`). The shared hash is proof of one source record
    inserted twice under two id schemes.
  - **7 same-name, same-phone duplicates** (Brooklyn Elite Volleyball, Goldfish Gowanus, Imagine Swimming
    UWS, Uptown Soccer Academy, Marlene Meyerson JCC, Asphalt Green UES, Brooklyn Music School) — thinner
    record retired.
  - **Two fencing clubs corrected**, and they are a good caution against merging on name similarity: Brooklyn
    Fencing Center (600 Degraw St, **Carroll Gardens**) and Brooklyn Bridge Fencing Club (295 Front St,
    **DUMBO**) are DIFFERENT REAL CLUBS. Both had duplicate records, and **all three stored neighbourhoods
    across them were wrong** — Park Slope, Gowanus and Downtown Brooklyn. Note this overrode the usual
    richer-record tie-break: for BBFC the record kept was the one that was *right*, not the one with more
    fields.
  - **Gotham Gymnastics**: three records on one phone, and none of the stored neighbourhoods was right —
    "Boerum Hill", "Williamsburg", and the gym is at 315 Douglass St in **Gowanus**. One corrected; the other
    CLEARED to empty rather than reassigned, because the operator really does have a second Douglass Street
    gym (opened summer 2024) whose street number was not findable, so picking between the two would be a
    guess.

  **NOT acted on, and this is the real finding: 326 records in 93 clusters remain, and the dominant cause is
  ONE CARD PER CLASS instead of one card per location.** Sixteen clusters of five or more account for 149
  records:
  - **YMCA of Greater New York — 102 records naming 50 branches.** One switchboard (212-630-9600) carries 30
    of them. They are not branches; they are individual classes: *"Greenpoint YMCA — Beginner Tennis"*,
    *"Bedford-Stuyvesant YMCA — Water Discovery 6–18 Months"*, *"Prospect Park YMCA — Preschool Stage 1 Water
    Acclimation"*, *"Dodge YMCA — Teen Fitness Orientation"*. A family browsing sees the same building five
    or ten times under different class names.
  - Same shape at smaller scale: **Aviator Sports 8** (one Marine Park venue), **Imagine Swimming 9** (two
    pools plus Baby Splash, Synchro, Skateboarding, Splash Ball Water Polo, Intensives), **St Patrick's CYO
    6** (one parish, six sports), **Soccer Stars 7**, **BBFC 3 program cards** on top of its venue card,
    **Manhattan Youth Tennis 11**.

  **Why this was deliberately not swept.** Retiring a YMCA's ten class cards removes that branch from the
  pool entirely unless a branch-level venue card exists first — and for most of these branches, none does.
  The correct fix is to create or designate one venue card per branch and fold the class list into it as
  content, which is a build-then-retire operation, not a hide sweep. Rushing it would delete real, findable
  places from a family's search results. **Recorded with counts so the next pass starts from the shape rather
  than rediscovering it**, and because the program-not-a-location rule has until now been applied one cluster
  at a time without anyone measuring how much of the catalogue it accounts for. It accounts for a third.
- v120 (2026-08-08): **switched the loop from oldest-first to defect-first, because the mechanical sweeps
  destroyed the age signal — and then worked 11 listings individually.**

  **The queue problem, recorded because it was self-inflicted.** Step 1 of this SOP says pull the oldest
  `updatedAt`. After the pool-wide sweeps of v115-v119, **every one of the 1,027 live listings has an
  `updatedAt` of 2026-08-07 or later**, so oldest-first no longer discriminates between a listing that was
  genuinely reviewed and one that was only touched by a scripted field fix. A bulk sweep buys scale at the
  cost of the ordering signal the manual loop depends on. Until a real `fieldVerifications`-style marker
  exists (recommendation 0b), the queue has to be built from DEFECT SIGNAL instead of age.

  **The defect inventory across 1,027 live listings**, which is now the queue:
  `address is a neighbourhood, not a street` **303 (29.5%)** · `neighborhood empty` **305 (29.7%)** ·
  `no phone` **322 (31.4%)** · `no phone AND no email` **229** · `short == long description` **85** ·
  `no ageRanges` **86** · `description truncated mid-sentence` **49** · `name is a single word` **19**.

  **Two negative results worth stating.** (a) All 303 placeholder-address listings DO carry a `geo` — but
  259 are `precision: "approximate"` and seven share one Upper East Side point, so the pin is a
  **neighbourhood centroid derived from the placeholder**, not a recoverable address. A map showing it puts
  a confident marker on a street the business is not on, which is arguably worse than no pin. (b) Only **10
  of the 303** name a street address anywhere in their own record, so this tier is genuinely research work,
  not another mechanical pass. Those 10 were done, and eight of them turned out to have a second defect.

  **The headline find: a live listing whose address was fictional.** `prov-jodi-s-gym`'s entire
  `longDescription` was the **Stardew Valley wiki** entry for a video-game character named Jodi — *"Lives In
  Pelican Town … Address 1 Willow Lane … Family Kent (Husband), Sam (Son), Vincent (Son)"* — and
  `1 Willow Lane` was sitting in the address field of a live listing, a fictional address in a farming
  simulator. Token-matched on the FIRST NAME "Jodi". **Entity-before-domain is what saved it from
  quarantine**: Jodi's Gym is a real Upper East Side children's gym operating since 1982 at 244 E 84th St,
  so the stored neighbourhood was accidentally right while every fact supporting it was invented. Rewritten,
  not retired. A follow-up scan for wiki/fandom/dictionary/app-store markers across all live listings found
  **no other instance**, which is a real negative result — this one was isolated.

  **Also in the batch:** Laser Bounce "Brooklyn" repurposed onto its real Glendale, Queens centre (it has no
  Brooklyn location and carried the Levittown, Long Island phone) — and its address exposed a specific
  extraction bug, **the hyphenated Queens house number `80-28 Cooper Ave` truncated to `28 Cooper Ave`**,
  which will not be the only listing where a Queens building number has lost its first half. Two unrelated
  listings both carried a wrong **"Bay Ridge"** (Brooklyn Dance Conservatory, really Carroll Gardens; Max
  Adventures, really Marine Park) — the same value-repetition-across-unrelated-records signal recorded for
  "East New York". SwimJim's UES listing said "Upper West Side" in its own neighbourhood field, free to
  catch. Galli Theater's source gave both a theatre address and an office address, and the theatre is the
  one written. Two listings got `needs_human` rather than a guess: Brooklyn ARTery (sources conflict, 1004
  against 1020 Cortelyou Rd) and SwimJim UES (two host pools, no single answer).
- v121 (2026-08-08): **the program-card cluster resolved at scale — the finding deferred in v119 as "too big
  to sweep safely" turned out to be safe once one obstacle was removed.** Live listings 1,027 → 870;
  placeholder addresses 294 → 217; empty neighbourhoods 305 → 184; phone-duplicate records 350 → 172;
  clusters of three or more 27 → 11.

  **What unblocked it.** v119 declined to sweep the 102 YMCA listings because retiring a branch's class cards
  would strand the branch if no venue card existed. Two things falsified that worry. First, the
  address-collision report showed a **branch-level venue card DOES exist** for several branches. Second,
  **fetching the operator's own branch directory (ymcanyc.org/locations) in ONE request** yielded all 24
  branch addresses and phones, so where no venue card existed one class card could be *promoted* — renamed to
  the branch and given the real address — before the rest were retired. **Build-then-retire, in that order**:
  14 venue cards created or enriched, then 56 class cards retired. YMCA-named live listings went 102 → 25.

  The same shape then resolved across a dozen more operators: Manhattan Youth (120 Warren St), LeFrak
  Center at Lakeside, Ms. J's, Fastbreak, St Patrick's CYO (six listings, one per SPORT, renamed to the
  organisation), Imagine Swimming (nine listings for three real pools), Gymstars, Soccer Stars, DUSC, BBFC,
  StreetSquash, Gleason's Gym, PAL, My Gym Park Slope, YM&YWHA of Washington Heights & Inwood.

  **The headquarters-address bug is general, not a WCS quirk — four instances, three different parent
  organisations.** Prospect Park Zoo and New York Aquarium were both filed at the Wildlife Conservation
  Society's HQ (2300 Southern Blvd, which is genuinely the Bronx Zoo's address, so a sibling legitimately
  holds it). Then **all fifteen** "Summer Sports Experience" listings were found storing *"The Arsenal,
  Central Park, 830 Fifth Avenue"* — the NYC Parks Department's headquarters — so a family looking up the
  Brownsville or Highbridge programme was sent to Fifth Avenue. And Kids in the Game's East Village and West
  Village camps both store 45 East 20th Street, the operator's office, which is in neither village. The
  fifteen Parks listings were NOT retired: unlike a program cluster at one venue, each names a genuinely
  different park, so one card per park is correct — only the address was replaced, with the park the title
  names, at borough grain rather than an invented street number.

  **The collision guard became a duplicate detector.** The address pipeline refuses to write a street address
  already held by, or being written to, another listing. Every one of its 41 refusals was a real finding: a
  duplicate pair, a program cluster, or the New York Aquarium being moved to the Bronx. **A guard built to
  prevent bad writes is worth reading as a report.**

  **One wrong address corrected that was NOT the pipeline's** — checked, because it mattered whose it was.
  Gotham Gymnastics' second listing stored "123 Metropolitan Ave" (Williamsburg); the operator has exactly two
  gyms and both are on Douglass Street, 315 and 316. Confirming the value was pre-existing rather than written
  during a bulk pass is the difference between a data defect and one of mine to undo.
- v122 (2026-08-08): **defect-first listing maintenance, run to the point where automated recovery is
  exhausted.** Measured across the live pool, start of this run → now: live listings **1,027 → 844**;
  placeholder addresses **294 → 203**; empty neighbourhoods **305 → 180**; single-word names **19 → 5**;
  scraped chrome in copy **20 → 5**; phone-duplicate records **350 → 142**; leaked pipeline prompt **0**.

  **The single-word-name sweep split cleanly in two, which is why it is worth running as its own pass.** Of
  18 matches, six were real businesses with a truncated name (Spark → The Spark; Khcc → Kingsbridge Heights
  Community Center; Billy → Billy Beez; Myb-kids → MYB Kids; Bronxworks → BronxWorks) and **eight were never
  a business at all**: `Evite` (an invitations company's blog listicle), `Eventective` (a venue-booking
  directory), `Health` (a NYC Department of Health page about *clinic billing and insurance*, live in the
  Bronx), `Bronxmama` (a parenting blog), `Category` (a course platform's browse page), `Host` (a camp
  directory's page about BronxWorks), `West` (a multi-operator camp round-up) and `Kids` (a one-word name
  carrying an unrelated business's address). **When the extracted name is a piece of site furniture, no
  single entity was ever identified.**

  **Two closure tells, both cheap to grep for.** `prov-apple-seeds`' description was its own farewell —
  *"It has been our greatest pleasure singing, dancing, playing… over the past 13 years"* — which reads as
  warm marketing until you notice it is past tense with a span of years and no forward-looking offer.
  Confirmed closed. And `hiartkids.com` now serves an **Indonesian lottery and gambling site**; a family
  clicking through from a children's art listing landed on gambling content. Entity-before-domain still
  applied (the domain-hijack pattern means a live domain proves nothing), but the entity check ALSO failed —
  no evidence Hi Art! operates — so it was quarantined and the website field cleared.

  **A correction to this pass's own work, recorded because the failure mode generalises.** Hi Art! and MYB
  Kids were "fixed" earlier the same day by rewriting `shortDescription` and renaming — leaving the original
  scraper artefact live in `longDescription`. **When replacing scraped copy, replace BOTH description
  fields**: fixing only the short one leaves the artefact in the field read second AND makes the listing look
  clean to the very scan that would have caught it. Two further artefact classes found this way, neither
  matched by the first chrome sweep's patterns: **cookie-consent banners** ("Functional cookies support
  features like content sharing…") and **login prompts** captured mid-sentence from behind a member area
  ("to your account to view your child's schedule…", which did not even start with a capital letter).

  **Where automated address recovery stops.** A second probe over the remaining 206 placeholder listings
  yielded only **17** single-candidate results and **one** that survived the guards. The rest divide into two
  useful buckets rather than a backlog: **36 multi-candidate listings, which is a SPLIT-CANDIDATE DETECTOR** —
  an operator whose own site yields several addresses is by definition one whose locations need separate
  listings (Greenwich House's four buildings, Berkeley Carroll's four, Steve & Kate's four campuses, NY
  Martial Arts Academy's four, Little Scholars' three, Modern Martial Arts' three, all now recorded with
  confirmed addresses so a split pass need not re-research) — and **borough contradictions** the guard caught
  rather than wrote (Chess at Three "Manhattan" resolving to a Park Slope address already held by its
  Brooklyn sibling; Nory "Brooklyn Heights" resolving to Manhattan's Garment District; Yombu "Manhattan"
  resolving to Park Slope). All recorded as `needs_human` with the question stated.

  **Fifth instance of the headquarters-address bug, across a fourth parent organisation**: the probe returned
  Soccer Stars' Upper West Side office (606 Columbus Ave) for **five** listings at once, including two
  Brooklyn ones and one named for **Nassau County**. Nothing was written — the operator teaches in rented
  gyms and parks and has no venue of its own, so the office is not a substitute.
- v123 (2026-08-08): **automated address recovery taken to its limit, and the limit itself turned out to be
  the finding.** A widened probe (accepting a borough token where the strict one required a ZIP) recovered
  four more addresses and surfaced two more duplicate pairs. Then a RELAXED pattern was run over the 198
  listings nothing else could resolve, purely as a diagnostic — and it is the clearest demonstration yet of
  why the guards exist.

  **The relaxed pattern produced a candidate for 73 listings and most were wrong**, in ways that would each
  have put a real family in the wrong place:
  - **Out-of-state head offices** — Russian School of Mathematics resolved to **Newton, Massachusetts**;
    Tinkergarten to **Columbus, Ohio**; FasTracKids to **Greenwood Village, Colorado**; Tutu School to
    **Montgomery, Alabama**; Prep Academy Tutors to **Toronto**; Sloomoo to **Atlanta**. Seven in one batch.
    **This is now the sharpest detector available for a national-brand listing whose specific local location
    is unevidenced** — sharper than the root-domain predictor, because a Manhattan children's listing
    resolving to Alabama cannot be anything else.
  - **Subway directions parsed as an address**: three Brooklyn Bridge Park listings returned *"3 Clark Street
    A C High Street"* — the station names from a travel-directions block run together. Nearly every venue
    page carries directions, and they parse identically to an address.
  - **An unreplaced template placeholder in the operator's own site**: Code Ninjas Brooklyn returned the
    literal **"1234 Street Place"**. The one case where the *source itself* contains fabricated-looking data,
    so any extractor reading it in good faith produces a street that does not exist.
  - A sibling branch of the same chain in another borough (Tiger Schulmann's UWS → a Bayside, Queens address).

  **Nothing from the relaxed pass was written automatically.** Eleven were hand-verified and written; the
  rest were recorded as `needs_human` with the specific finding, so the next pass starts from a diagnosis
  rather than a backlog.

  **One real correction fell out of it, confirming a measured pattern.** Penguin City Swim was stored as
  MANHATTAN; its pool is at 3220 Arlington Avenue in **Riverdale, the Bronx**. An earlier pass measured that
  wrong location guesses err toward the fashionable core and found all eight of its cards saying Manhattan or
  Brooklyn. This is the ninth instance of the same operator being pulled centrewards.

  **Where the 198 unresolved listings actually stand**, which is a result rather than a backlog: 93 have a
  reachable site that publishes no street address at all, 30 say in their own words that they have no fixed
  venue (mobile, in schools, multiple locations), 2 are unreachable, and 73 have an address their site shows
  in a form no safe pattern can extract. **The 30 no-fixed-venue ones are not defects** — they are the
  `venueModel` gap in the wild, and the right answer for them is a schema field, not a street line.
- v124 (2026-08-08): **five-card sovereign loop run end to end, and its outcome turned into a code rule.**
  Queue taken oldest-first from `contentCards` with the `kind: "content"` filter. All five were from the same
  2026-06-28 discovery run, and every one had a real defect — a 5/5 hit rate that says more about the run than
  about the sampling.

  | card | verdict | why |
  | --- | --- | --- |
  | British Swim School | `corrected` | franchisor root domain + compound borough hiding **two separate franchises** |
  | Fantasy Puppet Theater | `should_not_exist` | token-matched to **fantasy.premierleague.com**; real entity, but a touring company with no venue |
  | Swim Easy New York | `should_not_exist` | **adults-only** swim school |
  | Gotham Tennis Academy | `corrected` | sourced to its **Montauk** club, ~110 miles away, for a Manhattan claim |
  | Magic Evan | `should_not_exist` | real NYC magician who **travels to the party** — no venue |

  **The most consequential finding came through a pre-publish card, not from reviewing the live pool.**
  Checking Gotham Tennis surfaced `prov-gotham-tennis-academy-manhattan`, a PUBLISHED listing telling families
  a *Harlem* tennis academy is at **91 South Fulton Street on 631-668-8241** — the address and phone of the
  operator's **Montauk** club, area code 631 (Suffolk County). The whole record was Montauk data wearing a
  Manhattan label. Corrected to 160 Columbus Ave, Upper West Side (exactly one real Manhattan answer, which is
  the condition for correcting); phone cleared rather than replaced. **Working a pre-publish card is a route
  into the live pool that the live-pool sweeps do not reach** — worth doing deliberately, not only when a
  content card happens to be next in the queue.

  **Two cards needed BOTH checks, in the right order, to land correctly.** Fantasy Puppet Theater's source was
  the official Fantasy Premier League football game — judging by the domain would have quarantined it as
  contamination, for the wrong reason. Entity-before-domain showed the company is real and re-sourceable; it
  is quarantined anyway, on the *second* check, because it tours. Getting the right answer for the wrong
  reason still poisons the `terminalReason` a future pass reads.

  **Swim Easy is the subtlest adult-business case yet** — third after CompleteBody (fabricated "Kids" title)
  and Equinox (a members' crèche). Here nothing in the title, category or domain is wrong; it is an ordinary
  swim school whose own mission statement says *"the best swimming lessons for **adults** in NYC. Not everyone
  had a chance to learn as a child."* Only reading what the operator says it does catches it.

  **System improvement: place fields are now validated in code.** All five cards carried
  `boroughGuess: "Manhattan/Brooklyn"` and `neighborhoodGuess: "NYC-wide"`. `validateWriteRequest` now
  **rejects compound values and delivery models** in `borough`/`boroughGuess`/`neighborhood`/
  `neighborhoodGuess` — same class of rule as the "no category" placeholder, a value that is syntactically a
  string but semantically not an answer. A compound usually hides a split candidate (British Swim School's
  concealed two franchises); a delivery model launders the no-fixed-venue prohibition into a location. **An
  empty value is deliberately still allowed** — clearing a place field is how a reviewer records an honest
  absence, and that must stay available. Checked against the platform's own canonical vocabulary: **zero** of
  the 340 real borough/neighbourhood names would be rejected. Six tests added, 182 passing.
- v125 (2026-08-08): **sovereign loop, cards 1-16, and the loop itself improved twice off the evidence.**

  **Batch 1 (10 cards, oldest-first).** Every one had a real defect. Two terminal token-matches (The Party
  Fairy NYC sourced to the **FIFA World Cup 2026 NY/NJ host committee's fan-events page**; Mommy Poppins,
  which is a directory), one quarantine (New York Party Characters — costumed performers who come to your
  party), two demotions from PUBLISHED (Mozart for Munchkins, Commonpoint — both chain/touring duplicates of
  correctly-carded live listings), one blocker correction, two confirmations with a category fix, one program
  card, and one **repurpose**.

  **Loop improvement 1 — a token-matched card is not automatically terminal. Check whether the SOURCE is
  itself a real, in-scope, uncarded business.** "Bubbles and Balloons NYC" (no such business findable) was
  sourced to `gazillionbubbleshow.com` by a match on "Bubbles". The Party Fairy card, structurally identical,
  went terminal — but this one did not, because the Gazillion Bubble Show is real, plays at a permanent
  Off-Broadway venue (New World Stages, 340 W 50th St) and had **no card of its own**. Retitled onto it. The
  same defect shape yields a discard in one case and a new listing in the other; the deciding question is
  what is on the other end of the wrong URL.

  **Loop improvement 2 — query the DEFECT COHORT, and work its PUBLISHED members first.** Batch 1 noticed
  every card of one discovery run carried `boroughGuess: "Manhattan/Brooklyn"` and
  `neighborhoodGuess: "NYC-wide"`. Querying those values directly returned **219 distinct cards** — of which
  **six were PUBLISHED**, and those six became batch 2. Walking oldest-first would have reached them after
  hundreds of held cards. **Oldest-first finds cards; cohort-plus-published-first finds live harm.**

  **The inversion worth remembering: a compound place value is often the data telling the truth.** These were
  being treated as guessing failures. In batch 2 they were mostly accurate: Music To Your Home ("Manhattan/
  Brooklyn" / "Multiple") sends teachers to your home; Soccer Stars ("Manhattan / Brooklyn / NYC" /
  "NYC-wide") teaches in rented gyms; Mozart for Munchkins ("Multiple") tours. The field could not name one
  place **because there is not one**. A compound is therefore a strong pre-screen for the no-fixed-venue
  prohibition and for split candidates — not merely a value to tidy.

  **A hypothesis that did NOT generalise, recorded because negative results are cheap and worth keeping.**
  TLB Music sat QUARANTINED carrying `policy_or_safety_review` — the most serious code available — purely
  because its site returns HTTP 403 to automated requests. That looked like it might be a systemic false
  positive, so a sample of 25 quarantined cards was checked: **zero** carried the code. It was an outlier,
  not a pattern. (The real dominant quarantine reasons in that sample are `placeholder_or_junk_source` 19/25
  and `compacted_low_value` 10/25, which look broadly correct.) The TLB blocker was still removed and the
  three genuine content gaps kept — clearing a blocker requires its PREMISE to be false, and "the page
  couldn't be read" is not a safety finding.

  **Category signal**: three of four "Birthday Entertainment" cards across the two batches were travelling
  performers. For that category, check the DELIVERY MODEL first — it is the fastest disqualifier and saves a
  full research pass.
- v126 (2026-08-08): **batch 3 (24 cards) plus the cohort method turned into committed tooling.**

  **Batch 3 was the `sourceHost: "google.com"` cohort — 24 content cards storing a GOOGLE SEARCH URL as
  their source** (`google.com/search?q=<business>+kids+classes`), a placeholder discovery wrote when it
  found no real page. Twenty-one were already QUARANTINED. **The key distinction: a search URL is not a
  source, but the card's TITLE names a specific business**, so an entity exists to go and find — unlike a
  directory browse page, which names nobody. Entity-before-domain therefore applies, and the cohort split
  three ways:
  - **12 prohibited by delivery model** (8 travelling party entertainers, 4 online/in-home tutor networks:
    Varsity Tutors, Wyzant, Prep Academy Tutors, Tutor Doctor). Left quarantined, **ground corrected**.
  - **2 out of market** (Saf-T-Swim is a Long Island chain; Clay Art Center is in Port Chester,
    Westchester). Both had "NYC" appended to the operator's name — fabricated city presence.
  - **9 moved QUARANTINED → BLOCKED_REPAIRABLE**, i.e. rescued. Best of them: **Circus Warehouse**, a
    genuine Long Island City circus school at 53-21 Vernon Blvd with published hours and age-banded
    children's classes, buried purely because the pipeline stored a search URL instead of its website.

  **Correcting the GROUND without changing the state is a real outcome, not paperwork.** `terminalReason`
  is what the next pass reads. A card retired for "bad source" invites someone to re-source it; one retired
  for "the teacher travels to your home" does not. Twelve cards keep their disposition and get an accurate
  reason.

  **Tooling: `npm run cohorts` (`src/scripts/defect-cohorts.ts`).** The cohort method is now committed
  rather than re-derived each session. It enumerates the five cohorts that have already produced findings,
  dedupes across them, and prints the queue **worst-exposure first** — PUBLISHED before QUARANTINED, because
  a published card carrying a known defect is doing harm now. Three deliberate choices, each from a mistake
  in this repo's history: it is **read-only** (a script that both selects and mutates is how a bad rule
  reaches 219 records at once); it **retries each page and throws rather than returning short** (a silent
  partial scan reads as a complete one); and it stops only when a page adds **nothing new** to a seen-set
  (offset paging undercounts). `prioritise()` is exported and unit-tested — an unrecognised state sorts
  LAST, since a state the script has not heard of is not evidence of urgency.

  **SUPERSEDED IN PART — see v127.** This entry's queue model ranked states purely by exposure, and the
  batch note accompanying it said, of 1,317 unpublished cards, "none are PUBLISHED, so don't spend the batch
  here." That is wrong and was corrected by owner directive the same day: **drafts are maintained too**. The
  ordering described here is fine; using it as a FILTER was not.

  **Known limitation, stated rather than hidden:** the script could not be executed end-to-end from this
  sandbox — Node's fetch uses a different egress allowlist than curl and gets a 403 for the bridge host, so
  only its pure logic is verified by tests. It needs one live run in an environment that can reach the
  bridge before being trusted for enumeration counts.
- v127 (2026-08-08): **SCOPE CORRECTION, owner directive — every card is maintained, published AND draft.
  The only exempt cards are those whose CONTENT is forbidden.** This corrects a real error in v126 of this
  document and in the queue tooling, and the correction is bigger than the mistake.

  **What I got wrong.** I ranked cards by exposure — PUBLISHED first — which is right as ORDERING, and then
  used it as a FILTER: on finding 1,317 unpublished seed cards I wrote "none are PUBLISHED, so don't spend
  the batch here." Priority decides what you open first; **scope decides what is in the queue at all**, and
  drafts are always in it. The whole future catalogue passes through the draft states, so an unmaintained
  draft pool is an unmaintained catalogue tomorrow. Census: **779 PUBLISHED + 1,847 draft = 2,626
  maintainable**. Working only the published cards covered **30%** of the mandate.

  **The confusion this exposed, and it is the substantive finding.** Quarantine had been used as a bin for
  cards the pipeline could not finish. An audit of **all 1,221** quarantined content cards found **874
  carrying ONLY pipeline or completeness blockers** — `placeholder_or_junk_source` (861),
  `compacted_low_value` (489), `missing_official_image` (232) — with **no content-prohibition code at all**.
  Those are drafts, not forbidden content, and quarantine means *never revive*.

  Sampling before acting changed the plan, and would have caught a bad bulk write:
  - **673 are research TASKS, not cards** — titles like *"Activity research (Woodside, Queens)"* and
    *"Music provider research (Brooklyn NY)"*, on `internal://classscout/source-seed/` URLs. They name a
    neighbourhood, not a business. These are work-queue items that leaked into `contentCards`; moving them
    to a draft state would be as wrong as quarantining them. **Core-app recommendation: they need their own
    `kind`, not `kind: "content"`.**
  - **~200 name a real business** and are the genuinely mis-filed ones. **68 were returned to
    BLOCKED_REPAIRABLE** — Russian School of Mathematics UWS, Aquaskills Brooklyn, PLAY Greenpoint, Brooklyn
    Spanish Academy, Elite Skills Basketball, The Tiny Scientist Brooklyn and others. Returning a card to
    draft publishes nothing; it puts it back in the queue. The reality and venue-model checks are recorded
    as **still owed**, because restoring a card is not the same as verifying it.
  - Quarantine is doing its real job too: one card in that set was sourced to **xhamster.com**. That is what
    the state is for.

  **Codified, not just written down.** `defect-cohorts.ts` now exports `MAINTAINABLE_STATES`,
  `CONTENT_FORBIDDEN_STATES`, `NO_ENTITY_STATES` and `partitionByScope()`, with tests pinning that every
  draft state is maintainable and that the two exempt reasons stay distinct. **QUARANTINED and
  BLOCKED_TERMINAL are not interchangeable**: quarantine means the content must never be revived; terminal
  means there is no entity there at all (a directory page, a duplicate). Filing a card under the wrong one
  either buries a repairable business or resurrects a prohibited one.

  **A correction to v125's negative result.** v125 reported that `policy_or_safety_review` "does not
  generalise", on the basis that **zero** of a 25-card sample carried it. Enumerating all 1,221 quarantined
  cards shows **253 carry it — 21%**. The sample was unrepresentative and the conclusion was wrong. Since at
  least one of those (TLB Music) was confirmed to be a bot-block misread as a safety concern, this is now a
  real open question rather than a closed one. **A 25-card sample is not a census, and this document should
  say which it is every time.**
- v128 (2026-08-08): **oldest-first restored as the selection rule (owner directive), across ALL maintainable
  states — published and draft alike. 93 cards actioned.** Selection is now: pull the oldest `updatedAt` from
  every maintainable state and merge; state affects nothing but tie-breaking. Cohort queries stay, but as a
  loop IMPROVEMENT discovered while walking the queue, never as the selection rule.

  **Three new cohorts, each found by noticing a shape in an oldest-first batch and then querying it.**
  - **`boroughGuess: "Long Island"` — 58 cards, all actioned.** These are SELF-EVIDENCING: the card declares
    its own out-of-market status in a field that only accepts boroughs. Every neighbourhood value is
    unambiguously Nassau or Suffolk (Rockville Centre, Port Jefferson, Garden City, Hempstead, Levittown,
    Wheatley Heights), and a check for any title naming a New York City place returned **zero**, so none was
    a mislabelled Brooklyn or Queens business. Quarantined as out-of-market. **This is now the largest single
    piece of evidence for the unactioned taxonomy recommendation**: these are real, often excellent operators
    — Long Island Children's Museum, Usdan Summer Camp for the Arts, Hofstra Summer Camps — excluded purely
    because there is no way to express "real, nearby, serves NYC families, outside the five boroughs".
  - **`neighborhoodGuess` repeating `boroughGuess` — 403 cards, 89 PUBLISHED.** A new defect shape: "Manhattan"
    /"Manhattan", "Brooklyn"/"Brooklyn". It passes every validator including today's compound rule, because it
    is a single legitimate place name — and it still answers nothing a family did not already know. Where a
    real neighbourhood exists it can be corrected (Third Street Music School → East Village, from its own
    235 E 11th St); where it does not, the honest fix is to CLEAR it, because false precision is worse than
    an empty field (Brooklyn Lacrosse Club plays on public fields and names no home venue).
  - **Franchisor location-finder pages — 12 cards, 3 PUBLISHED, all terminated.** Two turned up in one batch
    (My Gym, The Little Gym), which suggested the crawler treats a location FINDER as a location; scanning all
    2,636 maintainable cards confirmed 12, including Tiger Schulmann's, Code Ninjas and YMCA of Metropolitan
    LA. **One card was deliberately excluded**: `britishswimschool.com/manhattan/our-locations/` is a single
    franchise's own pool list, not the franchisor's index. The distinction is whose locations the page lists —
    a franchisor's index spans separate companies; a franchise's own page lists its own venues.

  **A core-app finding: the LA neighbourhood vocabulary has real gaps.** Two cards in one batch could not be
  located because `locations.ts` has no entry for them — **Baldwin Hills** (Debbie Allen Dance Academy, a
  well-known institution) and **Malibu** (Aloha Beach Camp). South LA is missing entirely. Both were held as
  drafts rather than filled with a non-canonical value. The LA list is markedly thinner than the NYC one.

  **Consistency rule learned the same batch:** Soccer Shots was quarantined in New York earlier in this effort
  and its Los Angeles card was still live. When an operator is ruled out in one tenant, query the brand across
  ALL tenants immediately — applying a ruling to one city and not the other is how a catalogue drifts.
- v129 (2026-08-08): **oldest-first continued — 60 cards through the queue plus 63 by cohort in this run.**
  The 2026-06-30 Los Angeles discovery run dominates the oldest end: every card arrives with BOTH place
  fields empty while stating its neighbourhood in its own TITLE, so most of the work is a lookup against
  `locations.ts` rather than research. Located this way: Angels Gate (Harbor/San Pedro), Kidspace and A Noise
  Within (San Gabriel Valley/Pasadena), Silverlake Conservatory (Central LA/Silver Lake), LA School of
  Gymnastics and Broadway Gymnastics (Westside/West LA), Colburn (Central LA/Downtown), Aerials
  (SFV/Chatsworth), SCEGA (Santa Clarita Valley), Media City Ballet (SFV/Burbank), Barnsdall (Central
  LA/East Hollywood), Neighborhood Music School (Eastside/Boyle Heights), Tom Sawyer Camps and Armory
  (SGV/Pasadena), Morgan-Wixson (Westside/Santa Monica), Inner-City Arts (Central LA/Downtown).

  **NEW CORE-APP FINDING — the LA neighbourhood vocabulary systematically omits South LA.** Five cards in
  four consecutive batches could not be located because `locations.ts` has no entry: **Baldwin Hills**
  (Debbie Allen Dance Academy), **Crenshaw** (Lula Washington Dance Theatre), **University Park** (24th
  Street Theatre), **Exposition Park** (Natural History Museum), **Malibu** (Aloha Beach Camp). Four of the
  five are in South or South-Central Los Angeles. This is not an incomplete list, it is a list that omits one
  part of the city — so real institutions serving those families cannot be located at all. Every one was
  held as a draft rather than filled with a non-canonical value.

  **`policy_or_safety_review` escalated to core-app recommendation 0d.** Three more false positives turned up
  in this run (TLB Music, Bach to Rock Syosset, Manhattan Plaza Health Club). A census across the whole pool
  finds **428 cards carrying it — 175 maintainable + 253 quarantined** — and a sample of the maintainable
  ones is entirely ordinary children's businesses. **Deliberately NOT bulk-cleared**: wrongly clearing one
  real safety flag is far worse than leaving several false ones, so it is removed only on individually
  verified cards. The hypothesis worth testing in the core app is that an unreadable or non-200 source is
  being treated as a safety signal.

  **Two duplicates surfaced on identical sourceUrls** (YMCA of Metropolitan LA, Code Ninjas) — one copy
  caught by the location-finder cohort, the other by the oldest-first queue. Neither method alone found
  both, which is a small argument for running both. A duplicate-`sourceUrl` query is cheaper than either
  and is the next cohort to add.

  **Consistency across tenants:** Soccer Shots was quarantined in New York earlier in this effort and its
  Los Angeles card was still live until this run. When an operator is ruled out in one tenant, query the
  brand across all of them immediately.
- v130 (2026-08-08): **the `ripe_publish_attempted` cohort — 52 real cards parked behind a blocker that
  describes the pipeline, not the listing.** Found by noticing BAMkids, the Brooklyn Academy of Music's
  children's programme, correctly located in Fort Greene and sourced to its own site, sitting
  PARKED_COOLDOWN on it. The code records that publication was ATTEMPTED. That is pipeline history; it says
  nothing about the card.

  Most of the cohort is the same: German-American School Manhattan, TADA! Youth Theater, Randall's Island
  Park Alliance, Beam Center, Gibney, Steps on Broadway, Goethe-Institut, Streb, Dancewave, Cynthia King
  Dance Studio. All unparked, each with the fields checked named in its reason.

  **Three things were hiding inside it, and only working DRAFTS would have found them:**
  - **Off-topic contamination one publish attempt from going live.** `Samsung Find` — Samsung's
    device-location service — was parked with an Upper West Side neighbourhood attached, ready to publish.
    Quarantined. Nothing in a published-only queue would ever have reached it.
  - **Internal pipeline jargon in a public place field.** TADA! Youth Theater's neighbourhood read *"Near
    Manhattan priority zones"* — the discovery system's own targeting vocabulary. Corrected to NoMad from its
    real address, 15 West 28th Street.
  - **Three duplicate PAIRS** (Manhattan Soccer Club, Fastbreak Sports, Cynthia King Dance Studio). That is a
    consequence of how the cohort forms: a card the pipeline repeatedly tries to publish is exactly the kind
    that gets re-discovered and re-created.

  **Blockers were assessed individually, never cleared as a group.** On Baby Fingers, three codes got three
  different answers: the safety flag removed on the correlation evidence, `low_source_trust` removed because
  its premise is false (the source IS the operator's own domain), and the missing image and schedule kept
  because their premises are true. **Clearing a blocker requires its PREMISE to be false, not merely the
  business to be real** — the rule holds even when it would be quicker to clear the lot.

  **Where a place value could not be salvaged it was cleared, not softened.** Roughly a third of the cohort
  carried a compound, a delivery model, or the borough repeated as its neighbourhood — "Gowanus / Downtown
  Brooklyn", "Manhattan-wide", "Brooklyn schools", "Upper East/West Side". Each was emptied with a location
  blocker set, because an empty field is an honest absence while a vague one implies knowledge the record
  does not have.
- v131 (2026-08-08): **oldest-first continued, batches I and J.** Two findings worth carrying forward.

  **A new adults-only variant: the parent support group.** Two PUBLISHED cards —
  NewYork-Presbyterian Parent Support Groups and The Motherhood Center Support Groups — were live under the
  category "Classes". Both are clinical or peer support for ADULTS in a healthcare setting. Unlike an
  adults-only gym or swim school, these are genuinely FOR parents of young children, which is why they read
  as plausible and survived to publication. **The test that settles it is who attends and does what**: a
  parent support group is a service for the adult, not an activity a child takes part in. Recorded rather
  than hedged, because peer support for new parents is genuinely valuable and the ground for exclusion is
  scope, not quality.

  **URL depth separated a confirmed card from a terminal one, in the same batch, for the same operator.**
  `ymcanyc.org/locations/prospect-park-ymca` is a per-branch page and its card confirmed cleanly, correctly
  located in Park Slope. `ymcanyc.org/` — the homepage — was PUBLISHED as an organisation-level card with the
  neighbourhood "Lincoln Square", which is where the YMCA's head office sits rather than any branch. That is
  the headquarters defect appearing in a PLACE field rather than an address field, the sixth instance of the
  shape. Terminal, since 24 per-branch venue records already exist from the earlier consolidation.

  **An out-of-market fabrication invisible from the card.** Bubbles Academy NYC had a plausible name,
  category and Manhattan borough. One fetch of its own homepage settles it: the title tag reads "Child
  Development Classes & Preschool In **CHICAGO, IL**". Same shape as Saf-T-Swim and Clay Art Center — an
  out-of-market business given a New York presence by appending "NYC" to its name.

  **The delivery-model value still cannot be swept automatically, and this batch shows why.** Nine of ten
  cards stored one, and eight were genuine no-fixed-venue operators — but **Brooklyn Nature Days** carried
  "Brooklyn-wide" and turned out to run its forest-school days in Prospect Park. That satisfies the Brooklyn
  AYSO test: an organisation without premises of its own is in scope when children reliably attend ONE
  identified place. Corrected and kept. One fetch is the difference between excluding a real programme and
  locating it.

  **Split-candidate versus prohibition, sharpened.** Within the same batch, four operators were quarantined
  (a clown, a school-based sports franchise, two programmes in rented rooms) and three were held as DRAFTS
  (NYCFC, New York Red Bulls, NYC Juniors Volleyball). The difference is not whether the operator owns a
  venue — none of the seven does — but whether children attend **identified physical sites**. NYCFC runs real
  programmes at real partner facilities and simply names none on the card; that is repairable. A clown who
  comes to your house is not.
- v132 (2026-08-08): **the duplicate-`sourceUrl` cohort — 139 exact duplicates retired, and the query splits
  three ways rather than one.** This is the loop improvement earned by three duplicate PAIRS being split
  between different cohorts across two batches: one copy found by the parked cohort, the other by the
  oldest-first queue. Neither method alone caught any of them.

  Grouping all 2,581 maintainable cards by `sourceUrl` found **258 shared URLs covering 690 cards, 183
  involving a PUBLISHED card**. The critical refinement is that **a shared source is not evidence of
  duplication** — it splits into three cases that need opposite treatment:

  1. **Same title, same source → a true duplicate.** 119 groups, 270 records, **139 retirable**. No judgement:
     "Dribbl Brooklyn" twice, "Dodge YMCA" twice, "Prospect Park YMCA Youth Sports & Swim" twice. Acted on.
  2. **Different real locations, one ROOT domain → the root-domain defect, NOT duplication.** NY Kids Club's
     Brooklyn Heights, Chelsea, Park Slope and Upper West Side cards all sit on `nypreschoolandkidsclub.com`;
     Soccer Stars has eight and Dribbl eight. These are separate real branches that need re-sourcing to their
     own per-location pages. **Retiring them would delete real businesses.** Left alone.
  3. **Different businesses, one DIRECTORY page → real entity, bad source.** Eight cards share
     `brooklynbridgeparents.com/listing-camps/summer-camps` and each names a DIFFERENT real operator — Noel
     Pointer Foundation, Pixie Pods, Two By Two Childcare Academy. Each needs re-sourcing to its own site.
     Also left alone.

  Keep-selection for tier 1 is mechanical — most-exposed state first, then the record with more populated
  fields — so no card was chosen by taste.

  **The general lesson, which cost three missed pairs to learn:** a duplicate detector finds only the pairs
  its key can see. Normalised phone found punctuation and ID-truncation duplicates; shared `sourceHost` found
  cross-title clusters; shared `sourceUrl` finds exact re-creations. Each finds pairs the others structurally
  cannot, so running one and stopping produces a confidently incomplete answer.
- v133 (2026-08-08): **277 free public facilities unparked — `low_source_confidence` on official government
  and public-library domains.** Found when a batch of `laparks.org` per-facility cards surfaced in the
  oldest-first queue, all PARKED_COOLDOWN.

  The cohort is 280 cards and **every host in it is an official municipal or public-library domain**:
  `laparks.org` (233), `queenslibrary.org` (18), `bklynlibrary.org` (8), `nypl.org` (8), `lacity.org`,
  `griffithobservatory.org`. The blocker asserts the source cannot be trusted. For a city parks department
  or a public library system that premise is simply false, and 277 cards were held on it.

  **What was parked matters more than the count.** 233 Los Angeles parks, pools and recreation centres, and
  34 public library branches — the free, walk-in, no-cost children's programmes that families with the least
  money rely on most. An earlier pass had already examined the `laparks.org` set and concluded it was
  CORRECT — one card per real facility on a legitimate LA-tenant source — and deliberately left 28 of 30
  untouched as an example of the one-card-per-location rule working at scale. **They were parked the whole
  time on a code nobody had looked at.** Confirming a card is right does not surface the blocker holding it.

  Only this blocker was removed, only on official domains (3 non-official hosts in the cohort were skipped),
  state was left alone, and other blockers were kept — clearing a blocker still requires its own premise to
  be false.

  **This is the third false-premise blocker class found today**, after `low_source_trust` on institutions'
  own domains and `policy_or_safety_review` tracking record completeness. All three share a shape: a code
  whose NAME describes a judgement about the source or the content, applied on the basis of something
  mechanical. Worth checking every remaining blocker code the same way — what does the name claim, and what
  actually sets it?

- v134 (2026-08-08): **the matrix collapse — `categoryHint`/`activityTypes` were holding two different
  dimensions in one field, and a pipeline non-answer reached a live card as its lead chip.** Four owner
  directives from two screenshots, all implemented in code rather than as a data sweep, because each was a
  rule the bridge could enforce on every future write.

  **"Classes and camps are not activities — those are a different dimension of the matrix."** The stats
  page's single "By Activity" table ranked `Classes` (277) above every real activity, because most things
  are classes. FORMAT (how/when: Classes, Camps, Birthday Parties, Drop-In Activities) and ACTIVITY (what:
  Soccer, Art) are now separated by `src/lib/delivery/activityDimension.ts` and rendered as two tables.
  The collapse was in the DATA, not only the display — ~40 records store both axes in one string
  ("Sports / Camp", "Baseball Camp"), so values are split on `/` and a compound contributes to both
  breakdowns instead of forming a bucket of its own.

  **`activityTypes` now holds activities ONLY.** The format has its own field and its own badge on the
  card, so a "Camps" chip in the activity row was both a duplicate and a category error. 19 live records
  carried `Camps`, 13 `Classes`, 12 `Birthday Parties`.

  **A Sports parent category.** A listing carries its specific sport FIRST and `"Sports"` SECOND — the
  owner's three reasons: a parent reads the sport before the family it belongs to, analytics can collect
  every sport listing on one equality check, and it retires `"Multi-Sport"` (39 live records), which read
  as though it were a different sport sitting alongside Soccer. Seven further spellings of "sport,
  unspecified" collapse onto the parent too (`Various Sports`, `Team Sports`, `Sports Camp`…).

  **The sport-dominant rule**: when any sport is present, every non-sport tag is dropped. **This made
  recognition safety-critical rather than cosmetic** — under a rule that deletes what it does not
  recognise, a sport missing from the vocabulary is DELETED, not merely unlabelled. `isSportActivity`
  therefore matches a sport term as WHOLE WORDS anywhere in the label, so "Swimming Lessons" survives.
  Caught before any write, by an existing test.

  **The leak the owner named: "Preschool / Multi-enrichment is a technical leak, not something informal
  for a parent!!!"** On the live Kinder Prep Montessori card this was the LEAD chip. It is the same defect
  as the `no category` placeholder in a different vocabulary — the pipeline recording its own failure to
  classify, in the field a family reads. `Multi-category`, `Multi-enrichment`, `Multi-Activity` and their
  compound forms are now rejected by `validateWriteRequest` on every category field of every collection,
  and the 15 content cards carrying one (9 of them PUBLISHED) were given the canonical format value their
  own title states.

  Four things worth carrying forward, each of which cost something:

  1. **A guard that deletes what it does not recognise inverts the cost of an incomplete vocabulary.**
     Before the sport-dominant rule, an unlisted sport label was a missing tag. After it, the same gap
     silently deletes a real tag. When adding a rule that drops values, re-audit every list it consults —
     the list was written under the old cost model.
  2. **Removing a bad value can manufacture a worse one.** Stripping the trailing format noun turned
     `"Birthday Parties"` into a `"Birthday"` activity. Remainder extraction is now limited to formats
     recognised BY their suffix; a value that is a format outright yields no activity. This is the second
     instance of the already-recorded "after deleting a bad value, re-check what took its place".
  3. **The stats page was counting 7,570 `kind: "repair"` stubs against 5,056 real cards — 60% machine
     bookkeeping**, and those stubs were the source of both the "no category" bucket and most of the
     "(none)" bucket. `fetchRawRecords` now filters `kind: "content"`. A page that aggregates a collection
     must state which documents in it are cards.
  4. **A breakdown must exclude what the catalogue has retired.** With the stubs gone, the top activities
     in a children's catalogue were "Italian" (147) and "American" (141) — cuisines from the 795
     `letsgobaby.co` restaurant cards retired as `BLOCKED_TERMINAL` in an earlier pass. QUARANTINED and
     BLOCKED_TERMINAL are now excluded from every breakdown and reported as a separate `retired` count.
     A record the catalogue has given up on should not shape what the catalogue looks like.

  **A correction, recorded because the reasoning error is the reusable part.** Mid-task I concluded that
  `providers.primaryActivityType` was unreadable through this bridge and began widening the read
  projection to "fix" it. It was already in the projection, and had been printing real values minutes
  earlier. The evidence I acted on was the key list of `docs[0]` — ONE record that happened not to carry
  the field — which I read as the shape of the collection. `tsc` caught it only because the duplicate key
  was a compile error; a projection is a plain object and a semantically identical mistake elsewhere would
  have compiled. **To ask whether a field is readable, read the registry, not one document.**

  **A refusal you do not read looks exactly like a success — and the first diagnosis was wrong.** Four
  writes returned no `error` and a truthy `found` and changed nothing. This was initially written up here
  as "the write endpoint can return success without applying"; it cannot. The responses carried
  `blockedReason`, the fingerprint-collision guard naming the exact card the edit would have collided
  with — a named, deliberate refusal, in a field the driver never checked. The guard was working
  correctly; the caller was deaf to it. Two lessons, and the second is the one that generalises:

  - **A success check must enumerate every field a refusal can arrive in**, not just `error`. All the
    drivers now treat `blockedReason` as a failure.
  - **Read-back is what caught it, and read-back is what caught that the CHECK was wrong** — not just
    that a write was missing. Verifying against the database rather than against the write response is
    the only check that survives a bug in your own success criterion.

  The collisions were themselves real findings: two duplicate pairs (Fit Soccer Kids, SocRoc NYC), each
  two cards with an identical title and identical `sourceUrl` differing only in `categoryHint`. Both were
  correctly refused. In the SocRoc pair both records are already exempt (one QUARANTINED, one
  BLOCKED_TERMINAL), so no action is owed. The Fit Soccer Kids pair exposes a structural wrinkle worth
  naming: **a retired duplicate still occupies its fingerprint, and can therefore block the surviving
  maintainable card from being corrected** — the DISCOVERED card cannot take `categoryHint: "Soccer"`
  because its BLOCKED_TERMINAL twin already holds that exact identity. Left as-is and recorded, rather
  than resolved by editing a retired record back into service.

  **Result, verified by re-reading all 1,087 provider records from the database rather than by parsing
  write responses.** 640 records written, 0 failures, 0 mismatches; across the 1,043 live (non-quarantined)
  listings: 0 format values in `activityTypes`, 0 non-answers, 0 surviving generic sport spellings, 0 over
  the 3-tag cap, 0 compound values, 0 sport listings with the parent out of second place, 0 bad or
  out-of-order `primaryActivityType`. The analytics guarantee the parent category exists for now holds
  exactly: `Sports` appears on **693** listings and the independently-computed card-level `sportCards.all`
  is **693** — one equality check collects every sport listing, with nothing over- or under-counted.

  The stats page's own numbers moved accordingly: `contentCards` 12,626 → **5,056** (repair stubs excluded)
  with **2,595 retired** reported separately, and the `providers` FORMAT breakdown is now a single
  `(none)` bucket of 1,043 — no format value remains in any activity list.

  **`contentCards` completed too, and the completeness check mattered more than the fix.** `categoryHint`
  holds ONE value, so the two-level "<sport>, Sports" form cannot be expressed there; the ordering rule
  still decides which value survives — the specific sport leads, so it is the one kept, and the bare parent
  is kept only where no specific sport is named. 48 cards rewritten (`Multi-Sport` → `Sports`,
  `Sports / Soccer` → `Soccer`, `Baseball / Softball` → `Baseball`…), 46 applied, 2 correctly refused by
  the collision guard.

  **A census without the `kind` filter reported 218 remaining and was wrong in two independent ways at
  once** — several values returned exactly 25 (the `limit` cap, the already-documented partition-truncation
  trap), AND the whole set was dominated by `kind: "repair"` stubs. A proper loop-until-empty enumeration
  restricted to `kind: "content"` gives the real answer: **0 maintainable content cards still carry a
  pipeline non-answer, and 1 still carries a compound sport hint** — Fit Soccer Kids, the collision case
  above, whose only correct value is held by its retired twin. Every other remaining instance sits on a
  `BLOCKED_TERMINAL` repair stub, which is out of scope by the owner's own scope rule.

  Two traps fired in one query here, which is the point: a count is only as good as the scope statement
  attached to it. Say which `kind`, say whether it was capped, and prefer loop-until-empty to a single page.

- v135 (2026-08-08): **the `source_seed` cohort — 573 name-only stubs, and the mechanical test that split
  them into a safe 512 and a 61 that must not be swept.** Working the oldest-first queue surfaced this as
  the dominant thing at the old end: every one of the ten globally-oldest maintainable content cards was a
  `sourcePool: "source_seed"` record — `sourceUrl` `internal://classscout/source-seed/…`, `sourceHost`
  `classscout`, `entityKindHint: "unknown"`, `sourceAuthorityGrade: "weak"`, no category, held on
  `missing_source_url`. 537 of the 573 come from ONE run, `content-card-backfill-2026-06-16`.

  **A first reading of this cohort was wrong, and the error is the ordinary one.** The first ten titles are
  all cultural institutions ("Italian American Museum", "Society Of Illustrators, Inc.", "Drawing Center,
  Inc."), and the legal-entity styling reads exactly like a nonprofit-registry dump. Across all 573 it is
  nothing of the kind: ~28 are cultural institutions and the rest are ordinary children's providers —
  Super Soccer Stars, Chelsea Piers Swim School, NYJTL Community Tennis, Renzo Gracie Kids, Park Slope Day
  Camp, SwimJim UES. **Ten records is not a sample of 573**, and this is the third time in two days that
  generalising from the head of a list produced a confident wrong description.

  **The cheap mechanical test was the whole job.** These stubs never named a page, so there is nothing to
  re-source and `missing_source_url` can never be cleared on its own terms — the only question worth asking
  is whether a correctly-sourced card for the same business already exists. Matching normalised titles
  against the 3,739 content cards that DO carry a real `sourceUrl` answered it: **572 of 573 have an
  exact-title twin.** No research, one enumeration.

  **Then the sample rule earned its place again.** A twin existing is not the same as a twin that can carry
  the business: **61 of the 572 have twins that are ALL exempt** (QUARANTINED or BLOCKED_TERMINAL), so
  retiring those stubs would take the operator from one maintainable card to zero. Split accordingly —
  **512 retired as duplicates** with the canonical card's id recorded in the reason, **61 held**.

  **Token-overlap fuzzy matching was tried on the 61 and deliberately thrown away.** Most of those
  operators are real and their canonical card was RETITLED by earlier corrections (Goldfish Swim School
  Brooklyn Heights → the Gowanus school; Riverside Hawks → the correctly-sourced `riversidehawks.org`
  card), so exact matching cannot see them. A 60%-token-overlap matcher claimed to cover 47 of the 61 and
  was wrong in ways that would have retired real businesses: **"The Little Gym Upper West Side" → "Super
  Soccer Stars Upper West Side"** (matched on the neighbourhood) and **"Brooklyn City FC Academy" →
  "Friends Of City Reliquary Incorporated"** (matched on "city"). A title is mostly place words and
  audience words; the distinctive operator token is a small minority of it, so overlap ratios are dominated
  by exactly the parts that do not identify anybody. The 61 are `needs_human`, per the spec's own line —
  *a listing correctly escalated costs minutes; a listing confidently rewritten wrong costs a family*.

  A useful negative control on the 512: 14 of the exact-title pairs disagree on `boroughGuess`, and in
  13 of the 14 it is the STUB carrying a compound placeholder ("Manhattan/Brooklyn") against a canonical
  with a real value — evidence the canonical is the better record, not evidence they are different
  businesses.

- v136 (2026-08-08): **`recurringPrograms[]` is a SECOND activity list and a SECOND copy field, and the
  taxonomy pass missed both — caught by the owner, not by this loop.** "Recurring programs shows much more
  sports than the main part." The Flatbush YMCA card's top-level chip correctly read SPORTS after the
  taxonomy sweep while the block underneath still showed nine tags including the compound "SPORTS / CAMP".

  **This is a failure of a rule already written in this document.** "A defect found in one field is a
  defect to look for in every field of the same shape" was recorded about
  `recurringPrograms[].timeText` — the exact sub-document swept here. The activityTypes pass never asked
  what else holds activity tags. The cost was not cosmetic: **178 live programs still carried the banned
  `"no category"` placeholder** after it had been reported as cleared. Writing a lesson down is not the
  same as following it.

  Fixed at both layers. `applyCardBridgeWrite` now aligns `recurringPrograms[].activityTypes` whenever a
  providers write touches either list, so the two cannot drift apart again (a program's own title is
  preferred over the provider's when deriving its primary activity — it is better evidence of what that
  specific program is). 452 providers swept; verified against a fresh read of all 1,040 live listings:
  0 placeholders, 0 formats, 0 generic sport spellings, 0 over the cap, 0 compounds, 0 with the parent out
  of second place.

  **Then the same question was asked of EVERY field, which is what should have happened first.** Walking
  all string values of all live providers by path found the real prize: **276 `recurringPrograms[].timeText`
  values holding scraped page furniture** — "skip navigation", "Skip to content", menu bars, page titles,
  staff bios, testimonials, contact emails, and pipeline-internal text ("Supporting schedule evidence
  from ..."). That is the field a family reads to learn WHEN a class runs. All cleared, never replaced;
  inventing a schedule would be fabrication.

  **Length was the wrong test and nearly cost real data.** The first cut cleared everything over 45
  characters, which would have destroyed *"Summer camp runs July 6-10, 2026, Monday through Friday, 9:00
  a.m. to 3:00 p.m."* and *"Mon/Thu 4:30-6:00 PM; Tue 3:30-5:00 PM; Sat 9:00-10:30 AM"* — the most useful
  schedule strings in the whole field. Classify by CONTENT (does it name a time, a day, a month, a
  schedule word?) and read the long survivors individually: of 26 over 85 characters, 9 were genuine and
  17 were navigation, marketing, a bio or a testimonial.

  **The scan found four live, unquarantined reality-check failures as a side effect**, three now
  quarantined and one repaired:
  - `prov-welcome-to-gift-lms` — **the foreign-university-LMS instance already named in CLAUDE.md's
    contamination list, never actually quarantined.** `lms.gift.edu.pk`, GIFT University in Gujranwala,
    Pakistan, filed as an Upper West Side children's activity, describing ODL and the Flipped Classroom
    model. **A defect being documented is not the same as it being fixed** — worth re-checking every named
    instance in that list against live data.
  - `prov-hoop-heaven-nyc-manhattan` — its own site says "New Jersey's Premier Basketball Facilities",
    locations Whippany/Bridgewater/Waldwick. Out of market, Manhattanville fabricated.
  - `prov-cocoon-nyc` — prenatal and postpartum wellness coaching for WOMEN; no child attends. Fails the
    reality check the same way an adults-only gym does. Its scraped text also names Chicago.
  - `prov-peter-stuyvesant-little-league` — website was `en.wikipedia.org/wiki/Saint_Peter`, the token-match
    bug firing on the word "Peter". Entity real, so the website was cleared and the card KEPT. The
    description is scraped from the same article (it describes the Stuyvesant Town housing complex) and
    could NOT be cleared, because the copy-quality gate rejects an empty value — recorded in `reason` for a
    research pass rather than replaced with invented prose.

  Method note worth reusing: **walking every string value of a record BY PATH, rather than checking the
  fields you already suspect, is what turns one reported symptom into a census.** It also produced two
  false positives that were correctly not acted on — "Multi-activity summer camp" in a description is
  ordinary English, not the banned category value. The placeholder rules apply to CATEGORY FIELDS, not to
  prose.

- v137 (2026-08-08): **oldest-first resumed, 12 cards, and the batch's biggest find came from a cohort
  query rather than the queue.** With the 562 `source_seed` stubs retired, the oldest end of the queue
  finally surfaces real cards. Ten worked from the queue, two from a follow-up query.

  | card | outcome |
  | --- | --- |
  | CodeWizardsHQ NYC | QUARANTINED — online-only |
  | Baby Buggy | QUARANTINED — goods charity, not an activity |
  | SocRoc Soccer | BLOCKED_TERMINAL — fourth card of an already-ruled entity |
  | L.A. Equestrian Center | re-sourced off a hijacked domain + region set |
  | Camp Hollywoodland, Griffith Park Boys' Camp | LA region set from confirmed addresses |
  | Camp Seely | `needs_human` — outside the LA region taxonomy |
  | Center for Italian Modern Art | re-sourced from a news article to its own site |
  | Brooklyn Bridge Park Conservancy | compound neighbourhood resolved; false-premise blocker cleared |
  | STEM From Dance | located, blockers cleared, split candidate recorded |
  | **Mail Online** | **QUARANTINED — the Daily Mail, PUBLISHED as a Bronx birthday-party listing** |
  | Kallpachay Spanish Immersion | re-sourced off a directory browse page; venue question recorded |

  **The worst card in the batch was not in the queue.** Noticing that CodeWizardsHQ's `neighborhoodGuess`
  read `"Online / NYC"` prompted a query for place fields containing online/virtual/remote — three hits, one
  of which was **`"Mail Online"`, sourced to `dailymail.co.uk/home/index.html`, `PUBLISHED`, `categoryHint:
  "Birthday Parties"`, `boroughGuess: "Bronx"`, `neighborhoodGuess: "Baychester"`, zero blockers, and graded
  `sourceAuthorityGrade: "authoritative"`.** A family browsing birthday parties in Baychester was being
  shown a British newspaper. The authority grade is the tell worth remembering: it is a judgement about the
  PUBLISHER, and the Daily Mail genuinely is an authoritative publisher — it says nothing about whether the
  entity runs children's parties. **Walk the queue to learn a shape, then query the shape** — again the
  method that finds live harm fastest, and again a `PUBLISHED` card with no blocker.

  Four findings worth carrying forward:

  1. **The out-of-market taxonomy gap is now confirmed on the LA side, not just NYC.** Camp Seely is a City
     of Los Angeles-operated camp physically at 250 Highway 138, Crestline CA — San Bernardino Mountains,
     4,200ft, **65 miles from Los Angeles**. Every LA region value would be wrong by 65 miles. Previously
     this gap had five NYC-side confirmations (Fort Lee NJ, Huntington LI, Westchester/New Canaan, Long
     Island, Goldfish's LI schools); it is not an NYC quirk, it is a schema gap in both tenants.
  2. **A third confirmed domain hijack**: `la-equestriancenter.com` now serves "QQMacan", an Indonesian
     online-gambling site, while the Los Angeles Equestrian Center operates normally at 480 W Riverside Dr,
     Burbank on `thelaec.com`. Entity-before-domain is what saved it — judging the domain would have
     quarantined Southern California's largest equestrian centre.
  3. **A REBRAND is a distinct staleness pattern from a closure.** `babybuggy.org` now serves
     Good+Foundation: the organisation still exists, under a different name, and its own description makes
     clear it distributes goods through warehouses rather than running activities. The card was quarantined
     for the second fact, not the first — but the stale NAME is its own signal worth checking for.
  4. **`sourceAuthorityGrade: "authoritative"` is not evidence the card is real.** It grades the publisher,
     not the match between publisher and entity. It has now appeared on two confirmed contamination cases
     (a token-matched Wikipedia card, and the Daily Mail).

- v138 (2026-08-08): **the media/reference-host sweep — 9 more cards, and a THIRD confirmed case of a
  defect that was documented and never fixed.** Prompted by the Mail Online find, a scan of maintainable
  cards whose `sourceHost` is a news, reference, retail or platform domain returned 30, of which 3 were
  `PUBLISHED`.

  **Equinox Sports Club "Kids Programs" was still PUBLISHED with zero blockers** — a card whose defect is
  written up verbatim in `CLAUDE.md`'s hard-won lessons ("'Kids' in an AMENITY name is not evidence of a
  children's programme": Equinox's only child-related offering is drop-off childcare for adult members
  while they train, listed between the spa and the coat check). Quarantined now. **Together with the GIFT
  University LMS and the Fit Soccer Kids collision, that is three confirmed instances this session of a
  finding being written down and never applied to the record it was about.** The catalogue needs a sweep of
  every named instance in the documentation against live data — being in the docs is not being fixed.

  **Heal the Bay Aquarium contradicted its own title**: `boroughGuess: "Central LA"`,
  `neighborhoodGuess: "Downtown"` on a card literally titled "Heal the Bay Aquarium (Santa Monica Pier)".
  Santa Monica is Westside, ~15 miles from Downtown. A real, legitimate, currently-operating aquarium —
  only the location was wrong, and the free check-a-record-against-itself test resolved it with no research.

  **The sibling check changed the verdict on 4 of 6 token-matched cards.** Six real operators had been
  matched to famous pages on one word — `espn.com/soccer` for "**Soccer** Kids NYC" and "**Soccer** Shots
  Manhattan", `wikipedia/United_Kingdom` for "**British** Swim School", `wikipedia/Child` for
  "**Children's** Aid Athletics", `wikipedia/Brooklyn` for "**Brooklyn** Brazilian Jiu-Jitsu" and
  "**Brooklyn** Skate Garden". The instinct is to mark them all `BLOCKED_REPAIRABLE` with a re-source
  target. Checking each operator's own domain first showed **four already have a correctly-sourced card,
  three of them PUBLISHED** — so those are duplicates with nothing to re-source to, and only Soccer Shots
  (zero cards on `soccershots.org`) and Brooklyn Skate Garden are genuinely repairable. A seventh,
  "Pinterest Login" on `tr.pinterest.com/ideas`, names no entity at all and is structurally terminal.

  **A methodology note, from my own error.** The host denylist regex matched `healthebay.org` because
  "**ebay**" is a substring of "heal-**thebay**" — the exact `Art`-inside-`mARTial` bug already recorded
  twice in this document, reproduced a third time in a throwaway scan. It surfaced a real defect by
  accident, which is luck, not method. **Anchor host patterns on a dot or string boundary.**

- v139 (2026-08-08): **auditing the documentation against live data — because "documented" had been
  mistaken for "fixed" three times in one day.** Extracted all 99 record ids named anywhere in `CLAUDE.md`
  and `docs/`, and read every one of them from the database. 27 content cards and 34 providers named in the
  docs are still maintainable; 17 of the content cards are `PUBLISHED`.

  Most were correctly live — they are the cards that WON their clusters. Three were not:

  - **Equinox Sports Club "Kids Programs"** (v138) — defect written up verbatim in `CLAUDE.md`, still
    PUBLISHED with zero blockers.
  - **Marlene Meyerson JCC Manhattan ×2**, both PUBLISHED on `mmjccm.org`, differing only by the day-camp
    page versus the root. One institution, one address, two cards distinguished by a format qualifier —
    the program-not-a-location rule. Programme card retired; the venue card stays.
  - **Two `camp.com` cards whose own `terminalReason` recorded the fix but whose data never received it.**

  **The `camp.com` pair is the most useful finding, and it is not dishonesty in the record — it is a
  capability that arrived after the research.** Both entries end with the words *"(sourceUrl is not
  writable through this bridge)"* and then give the correct URL. That was true when they were written.
  `sourceUrl` became writable later, and nobody went back. Applying the two recorded URLs took one write
  each and no research at all:
  `camp.com/` → `kidville.com/westside/our-services/camp-kidville/` (a token collision: CAMP the retailer
  is not Kidville) and `camp.com/` → `camp.com/locations/fifth-ave-nyc` (root domain → the real store page).

  **Two lessons, and the second generalises well beyond this repo.**

  1. **A label that asserts a completed action on a record where it was only RECOMMENDED is its own
     defect.** The Kidville entry is prefixed `token_collision_wrong_source_domain_corrected`. It was not
     corrected; the body says so plainly. Anyone skimming labels — or grepping — would have believed it.
     Prefer a label that names the STATE (`..._recommended`, `..._blocked_on_capability`) over one that
     names the intent.
  2. **When a capability is added, sweep the records that were blocked on its absence.** A query for
     `terminalReason` containing "not writable through this bridge" / "re-source target" returned 10 cards,
     of which 2 still differed from their recorded target. That is a permanent maintenance move: every time
     a field becomes writable or a validator is relaxed, the notes that were written *because it wasn't*
     become an actionable work-list. Research already paid for should not be re-paid.

- v140 (2026-08-08): **the "Family Events" cohort — 52 cultural institutions, all missing a neighbourhood,
  most carrying IRS-registry names.** With the seed stubs gone, the oldest-first queue surfaced the
  correctly-sourced SIBLINGS of those stubs: real museums and historic houses on their own domains, from the
  same nonprofit-registry backfill. Every one of the 52 had `categoryHint: "Family Events"` and **no
  `neighborhoodGuess` at all**, so none could be found by anyone browsing a part of the city. 32 actioned.

  **Four failed the reality check, and the shape of each is different:**

  - **Museum of Comic and Cartoon Art** — permanently closed since July 2012; its collection went to the
    Society of Illustrators, which is already carded correctly. Confirmed-closed, like City Treehouse.
  - **Museum for African Art** — sourced to `africa.si.edu`, the **Smithsonian's** museum in **Washington
    DC**: a different institution in a different city. The New York one closed its LIC space in 2006,
    renamed itself The Africa Center, and its Fifth Avenue home is still under construction. Defunct
    identity + out-of-state source + no visitable venue.
  - **Chelsea Art Museum** — closed 2011, AND its domain `newyork.artemuseum.com` now serves "Arte Museum
    New York", an unrelated Korean immersive-media attraction. Two independent failures on one card. (Noted
    for a future pass: Arte Museum is itself real and could merit its OWN card — a new record, not this one
    repaired.)
  - **Contemporary Art For America, Inc.** — sourced to `moma.org`, which is a different institution
    entirely. Left `BLOCKED_REPAIRABLE` as `needs_human`: the entity is unproven, not disproven.

  **13 real institutions were enriched from their OWN sites rather than from memory** — addresses scraped
  from each museum's own pages, then mapped to canonical neighbourhoods: The Drawing Center → 35 Wooster
  St → SoHo; MOCA → 215 Centre St → Chinatown; Skyscraper Museum → 39 Battery Pl → Battery Park City;
  Waterfront Museum → 290 Conover St → Red Hook; Dyckman Farmhouse → 4881 Broadway → Inwood; and so on.
  Titles were corrected in the same write, because **this cohort's names are the defect that hides the
  rest**: "Colonial Dames Of America/mount Vernon Hotel Museum & Garden", "Sons Of The Revolution In The
  State Of New York, Inc.", "Drawing Center, Inc." — IRS legal names with broken Title Case, none of them
  what a family would type. Renamed to the public identity (the Sons of the Revolution card is the
  **Fraunces Tavern Museum**, which is the name anyone actually knows it by).

  **15 City of Los Angeles facilities were unlocatable and are now placed** — Cabrillo Marine Aquarium and
  Fort MacArthur (Harbor / San Pedro), the Drum Barracks and Banning Residence (Harbor / Wilmington), four
  Griffith Park sites incl. Travel Town and the Autry (Central LA / Los Feliz), Campo de Cahuenga (SFV /
  Studio City), Heritage Square (Eastside / Montecito Heights), Olvera Street and the Keck Children's
  Amphitheatre (Central LA / Downtown).

  **A vocabulary gap, recorded rather than papered over:** Bolton Hall Museum is at 10110 Commerce Ave,
  **Tujunga** — a real Los Angeles district absent from this platform's San Fernando Valley neighbourhood
  list. Region set, neighbourhood left ABSENT rather than coerced into a listed neighbour. Same discipline
  as Camp Seely, one level down: a missing vocabulary entry is not licence to write the nearest wrong one.

- v141 (2026-08-08): **50 more cards — the Family Events cohort finished, plus the oldest live listings.**
  54 records actioned across this continuation. The bulk was enrichment rather than triage, which is what
  the queue looks like once the structural junk is gone.

  **23 institutions enriched from their own sites** (addresses scraped from each museum's own pages, then
  mapped to canonical neighbourhoods): 9/11 Memorial & Museum → Financial District; Cultural Museum of
  African Art → 1360 Fulton St → Bedford-Stuyvesant; The City Reliquary → 370 Metropolitan Ave →
  Williamsburg; Onderdonk House → Ridgewood; Queens County Farm → Floral Park; Conference House →
  Tottenville; Noble Maritime → New Brighton; Museum of Maritime Navigation → 1208 Bay St → Rosebank;
  Prospect Park Alliance → Park Slope — plus the 13 recorded in v140.

  **Titles were the defect hiding the rest.** This whole cohort came from a nonprofit-registry backfill and
  carried IRS filing names with broken Title Case: "Sons Of The Revolution In The State Of New York, Inc."
  (which is the **Fraunces Tavern Museum**), "Staten Island Institute Of Arts And Sciences" (the **Staten
  Island Museum**), "Morris-jumel Mansion, Inc.", "Colonial Dames Of America/mount Vernon Hotel Museum &
  Garden". None is what a parent would type. Also cleaned: `"Queens County Farm — Events Calendar"`, where
  the page-title artefact had become the museum's name.

  **Three findings from the live-listing half of the batch:**

  1. **"North Brooklyn YMCA" is not in north Brooklyn.** Stored as `"Williamsburg / Greenpoint"` — which is
     what the phrase means colloquially and what the branch's NAME implies. Its own page gives 570 Jamaica
     Avenue, 11208: **Cypress Hills**, six miles east. The neighbourhood had been inferred from the brand
     name rather than read from the source — the Prospect Gymnastics mechanism — and it errs toward the
     fashionable core exactly as the measured pattern predicts. Two documented patterns intersecting on one
     card.
  2. **Camp Settoga: the defect I expected was the opposite of the real one.** The card read "Camp Settoga
     NYC / 14th Street Y" sourced to `mmjccm.org`, which looks like a source pointing at the wrong
     organisation. In fact Camp Settoga is operated BY the Marlene Meyerson JCC Manhattan — the source was
     right and the TITLE had welded in an unrelated organisation. Its real defect is location: **127 Call
     Hollow Road, Pomona, NY**, in Rockland County, stored as "Manhattan / Downtown / Regional". Cleared
     rather than coerced. **Seventh confirmation of the out-of-market gap, and the strongest case yet** —
     a real NYC institution's real camp that NYC families reach on its own buses, which no borough value
     can honestly express.
  3. **Two more vocabulary gaps**, both handled by leaving the field absent: Lighthouse Hill (Jacques
     Marchais Museum of Tibetan Art, Staten Island) and Tujunga (Bolton Hall, LA). With Camp Seely and
     Camp Settoga that is four location values in two rounds that the taxonomy cannot express.

  **A note on what "reviewed" should mean when nothing improves.** South Street Seaport Museum's name was
  already right and no address could be extracted from its own visit or contact pages. Rather than touch it
  silently, the remaining gap is written into `terminalReason` — so when it resurfaces in the oldest-first
  queue, the next pass starts from "the site does not publish a parseable address" instead of re-running
  the same failed extraction.

- v142 (2026-08-08): **the content-quality pass on `providers` — 137 records, and two auto-extraction
  approaches abandoned on evidence.** Owner asked for quality "including the newly added properties".
  Descriptions, phones, addresses and the new program fields exist ONLY on `providers`, so this run was
  centred there. A full scan of all 1,040 live records produced the defect census below.

  **Fixed (137 records, all verified by re-reading):**

  | | count |
  | --- | ---: |
  | descriptions replaced with the operator's own `<meta description>` | **94** |
  | `shortDescription` hard-truncated at 120 chars, mid-word, regenerated from the full text | **33** |
  | misattributed `website` values cleared | **10** |

  **Broken descriptions went 221 → 127 on visible records.** The replacements are the site's own
  self-authored summary — nothing written or inferred here — and were rejected wherever the meta tag was
  itself chrome, absent or too short. The truncation fix needed no research at all: all 34 were exactly 120
  characters ending mid-word (`"…Carroll Gardens, Cobble Hill, Boerum Hil…"`) while `longDescription`
  already held the full text, so the short one is regenerated from whole sentences. 32 of the 34 were
  PUBLISHED.

  **A NEW defect class, in the field a parent CLICKS: `providers.website` pointing at another
  organisation.** Found by grouping live providers on their normalised website and keeping only groups
  whose names share no distinctive token. 112 exact URLs are shared by 2+ providers; 22 of those groups are
  different operators. **Upper East Side Tennis Club pointed at `nba.com/nets`. Brooklyn Dance & Sports
  Club pointed at a rock-climbing gym. Two lacrosse clubs pointed at `lax.com`, an equipment RETAILER.**
  Cleared, not replaced — same rule as a wrong phone number: an empty field is an honest absence, a wrong
  one sends a parent to a stranger. (Most of the other 90 shared-URL groups are one operator with many
  programme cards — the known program-not-a-location class, where the URL is correct.)

  **Two automated approaches were built, tested and THROWN AWAY. Both deserve recording, because the
  instinct to ship them was strong.**

  1. **Price extraction from stored copy — abandoned.** 78 providers have a `$` amount in their own
     description, which looks like free enrichment. The extractor produced **$100/week for Amazing
     Athletes out of a navigation menu**, and — worse — read *"Rocking the Boat lists pricing at $450 per
     camper per week"* and wrote **$90 per person**. That is precisely the "never round a price into a
     different unit" rule, violated automatically, in the field the core spec says costs trust fastest.
     **The order matters: you cannot mine prices out of descriptions until the descriptions are clean**,
     and even then the unit needs a human. No prices were written.
  2. **Body-prose extraction — abandoned for `shortDescription`.** Where no meta tag existed, pulling the
     first clean paragraph from the page body produced text that was often *worse* than what was stored
     (replacing "Gymnastics birthday parties in Tottenville" with a generic strength-and-coordination
     blurb), and produced **the same paragraph for two unrelated businesses** — which is what exposed the
     shared-website bug above. A lower-confidence source must not overwrite a higher-confidence field.

  **Two negative results worth as much as the fixes.** 195 live records whose `shortDescription` is an
  internal maintenance note ("Duplicate record; see Brooklearn.", "A class at Dodge YMCA; see the Dodge
  YMCA listing at 225 Atlantic Avenue") looked like this loop leaking its own working notes to families —
  **all 195 are `visibility: hidden`**, correctly retired tombstones. Checking one field prevented 195
  needless writes. And 34 descriptions flagged by a prompt-leak regex were **all false positives**: good,
  specific copy that merely ended in an ellipsis. Third time in two days that one of my own scan regexes
  over-fired; the fix each time was to read the matches before acting on the count.

  **v142 continued — the rest of the 200.** 177 provider records written in this pass:

  | fix | count | source of truth |
  | --- | ---: | --- |
  | descriptions replaced with the operator's `<meta description>` | 94 | the site's own tag |
  | `longDescription` replaced with page prose (long field only) | 19 | first genuine paragraph |
  | hard-truncated `shortDescription` regenerated | 33 | the record's own `longDescription` |
  | misattributed `website` cleared | 10 | cross-provider URL grouping |
  | `neighborhood` derived | 17 | the record's own `address` |
  | `phone` added | 4 | the operator's own page, strictly validated |

  Verified against a fresh read: broken descriptions on visible records **221 → 120**, truncated
  descriptions **34 → 1**.

  **A fourth naive-match false positive, caught before writing.** Deriving `neighborhood` by looking for a
  canonical name anywhere in the stored address matched **"Richmond" inside "1000 Richmond Terrace"** and
  would have filed six Staten Island museums in Richmondtown. Requiring the neighbourhood to be a
  COMMA-DELIMITED COMPONENT of the address cut 58 candidates to 19, all correct. Two of those 19 were then
  dropped because their "address" lists three neighbourhoods ("Fort Greene, Park Slope and Cobble Hill
  locations") — split candidates, not addresses.

  **This is now the session's most reliable finding about method.** Four separate scans in one pass
  produced plausible-looking garbage from naive matching: `ebay` inside `heal-thebay`, `Art` inside
  `mARTial`, `Richmond` inside `Richmond Terrace`, and a price of `$90 per person` from a sentence reading
  "$450 per camper per week". **Every one was caught by reading the matches rather than the count, and
  every one would have shipped if the count alone had been trusted.** Budget for reading a sample of any
  scan's output before acting on it, every time.

  **Where the new structured properties now stand** (830 programs on live records): 512 carry a
  `schedule{}`, 121 of them `precision: "exact"`; 434 carry numeric ages; **0 carry a `price{}` — and that
  is the correct number.** Price is the one field this loop should not automate, and the attempt above is
  the evidence.

- v143 (2026-08-08): **the 1,000-card pass, worked by defect cohort — 603 records — plus the process
  change that the previous pass's mistakes earned.** The maintainable content-card pool is 1,885, so
  "the oldest 1,000" is most of it; and because earlier bulk sweeps compressed `updatedAt`, oldest-first no
  longer discriminates. Profiled all 1,885 by defect SHAPE instead and worked the largest cohorts.

  ### The process change: `src/scripts/scanGuards.ts`

  Four naive matches in one pass on the previous day produced plausible garbage — `ebay` in
  `heal-thebay`, `Art` in `mARTial`, `Richmond` in `Richmond Terrace`, `$90 per person` from "$450 per
  camper per week". **The shared cause is not any one regex: a scan reports a NUMBER, and a number looks
  equally trustworthy whether or not the rows beneath it are real.** So the lessons are now tested code:
  `matchesWholeWord`, `hostMatches` (anchored on a label boundary, and a bare label like `ebay` now matches
  NOTHING so writing one in a denylist fails loudly), `addressNamesPlace` (comma component, not substring),
  `isPlausibleNanpPhone`, `repeatedValues`, and `requireSample`, which renders a scan's own output so it
  must be read before it can be acted on. 12 tests; two of my own test expectations were wrong and were
  corrected rather than the code.

  **It paid for itself immediately.** A matcher pairing the 111 Google-sourced cards with correctly-sourced
  siblings reported **82 duplicates**; the sample showed "City Ice Pavilion" matched "Karate City" on the
  word *city*, and "Brains & Motion" matched "Kids N Motion" on *motion*. **82 real cards would have been
  retired on a word.** Nothing was written; the finding was recorded on each card instead.

  ### What was fixed

  | cohort | count | action |
  | --- | ---: | --- |
  | `neighborhoodGuess` == `boroughGuess` | 189 | cleared — a non-answer |
  | `neighborhoodGuess` is a delivery model | 198 | cleared — "Brooklyn-wide" is not a place |
  | compound with exactly ONE canonical part | 43 | resolved to that part |
  | source is a Google search query or Maps link | 111 | finding recorded; NOT bulk-retired |
  | false-premise source-trust blockers on institutional domains | 55 | cleared |
  | off-topic contamination | 6 | quarantined |
  | cross-borough neighbourhood mismatch | 2 | corrected / cleared |

  Verified against a fresh read: neighbourhood-equals-borough **189 → 1**, delivery models **198 → 0**.

  ### Three findings

  1. **The pipeline stores its own SEARCH QUERY as a source.** 111 maintainable cards are sourced to
     `google.com` — 87 to `/search?q=<business name>+kids+classes`, the literal query the pipeline ran, and
     24 to a Maps `place_id` deep link. That is a working step leaked into the data, the same family as the
     LLM prompt published as a description. All are `BLOCKED_REPAIRABLE`, none published, and the entities
     are real — so what each card now carries is the instruction that only a domain lookup is needed, plus
     the explicit warning not to bulk-retire the cohort on a title match.
  2. **A new contamination cluster, found by querying for IMPOSSIBLE borough/neighbourhood pairs.** Three
     cards shared `Staten Island / Upper West Side` — a pairing that cannot exist — and all three were
     off-topic: a Cleveland Clinic breastfeeding article, an American Academy of Pediatrics page, and
     **monthlycalendar.net's list of Memorial Day dates to 2045**. Querying for a *structurally impossible*
     value is a cheap contamination detector that needs no entity knowledge at all. Also caught: `Manhattan
     / Allerton` (a Bronx neighbourhood) and `Brooklyn / Astoria` (a Queens one).
  3. **A retired duplicate's fingerprint can block the survivor from being corrected — now seen twice.**
     Clearing the PUBLISHED "Manhattan Soccer Club" card's non-answer neighbourhood was refused, because it
     would have made it identical to one of its two already-`BLOCKED_TERMINAL` twins. The guard is right,
     and the card keeps a slightly worse value as a result. Same wrinkle as the Fit Soccer Kids collision;
     worth a product decision rather than a third rediscovery.


- v144 (2026-08-08): **the location-evidence audit — 64 live provider records.** Abandoned a 74-card
  domain-keyed fill after reading the plan whole (rather than sampling it) exposed that the field it
  keyed on was itself defective; found that the obvious audit of that field was circular, because 288
  of 1,040 live providers store the neighbourhood name AS the address. Then ran three checks that rest
  on facts instead: ZIP vs borough (21), the NYC Parks HQ address at census scale (26 — two of whose
  parks are not in the borough claimed), and the record contradicting its own name (20). Cleared an
  18-record shared-default location. New: `src/scripts/locationEvidence.ts` + 12 tests.

- v145 (2026-08-09): **the quarantined-twin cross-collection check, and 92 real neighbourhoods.**
  Extended the real-neighbourhood sweep from 29 to 92 of 345, resolving straddling ZIPs from
  Manhattan's house-numbering convention rather than the ZIP — and rebuilt, by hand, the exact
  substring false positive `scanGuards.ts` was written to prevent two commits earlier (`\byork\b`
  matching the "York" in "New York", on every Manhattan address at once). New check: 18 maintainable
  cards, 12 `PUBLISHED`, whose only provider twin is quarantined — a lead generator, not a bulk
  action, since four of them are the correct output of an earlier split. Four confirmed-closed
  businesses were live.

- v146 (2026-08-09): **batch curation — seven batches, 45 listings, every component.** Replaced
  single-field cohort sweeps after an owner directive. Built a defect-signal queue to replace `updatedAt`
  (dead, because this loop's own sweeps touched the pool); each batch added a signal, ending with
  `desc_binary` after Textile Arts Center was found storing raw gzip bytes as its description. Ran the
  reference-host check on PROVIDERS for the first time: 7 hits, and on providers the article's text
  becomes the business's description. Two clusters resolved build-then-retire (Gjøa, TMFC). Manhattan
  Patriots quarantined — it is in Manhattan, ILLINOIS.

- v147 (2026-08-09): **batches 8-10 — the citywide-programme-index cohort.** Thirteen live providers
  shared the byte-identical borough `"Manhattan or Brooklyn"`; five were satellites whose own
  descriptions told the reader to look at another listing (hidden, parents confirmed first) and eight
  were genuine citywide programmes (borough cleared, kept live). Zero compound boroughs remain. Also:
  CompleteBody Kids quarantined, Peter Stuyvesant Little League's description was an encyclopaedia
  passage about a 1940s housing complex, and an LA-vocabulary gap recorded for Crenshaw.

- v148 (2026-08-09): **batches 11-12, and the hole the cohort sweep left open.** The compound-place
  guard never listed `or`, so v147's claim that `"Manhattan or Brooklyn"` was rejected on write was
  false and the owner caught it; `or`/`;`/`|` added with tests and all 341 canonical names re-checked.
  Re-running the widened guard found 130 content-card values it would now reject, 17 mechanically
  resolvable. Tinkergarten quarantined (no venue anywhere); a record literally named "West" whose own
  description said it was a directory page was retired.

- v149 (2026-08-09): **the 51-card `Manhattan/Brooklyn` cohort, researched and closed.** 45 resolved, 6
  `needs_human`. The compound was not a coincidence alongside the defect but its cause: the cohort is
  dominated by party entertainers (19, no premises at all) and clubs training in several rented school
  gyms (7). Two of the latter proved Manhattan-only. Also quarantined a real Tribeca balloon SHOP (retail
  is not an activity), a magician with an office address, and a Zoom-only subscription.

- v150 (2026-08-09): **a fabricated cluster of nine, found by the ABSENCE of a website.** Generic
  `<Place> <Sport> <Club>` names with plausible street addresses and no source; none of the businesses
  exists. Such a record passes every field-level check and looks better than the honest ones around it,
  which is why it survived — and why two of my own writes had improved a field on one before anyone
  asked whether the business was real. Both reversed. `website_missing` reclassified from a minor
  completeness gap to the strongest fabrication signal in the set. Also: a media-host scan, the
  satellite cohort closed at zero, and a queue that was serving 209 already-retired records.

## v144 (2026-08-08): the location-evidence audit — 64 live provider records, and a check that was measuring itself

This round started as a routine continuation of the cross-collection neighbourhood fill and turned into
something else entirely, because the plan's own sample would not survive being read.

### The fill that was abandoned, and why the abandonment is the finding

The plan was: map each `providers.website` domain to the single neighbourhood its provider record claims,
then fill matching `contentCards` that have none. 74 candidates survived the guards already built for it
(a multi-branch operator's domain cannot serve one answer to all its cards; a card whose own title names a
different neighbourhood is not to be overridden). A random sample of ten read clean.

**Reading all 74 instead of a sample killed it.** `"Downtown Brooklyn"` appeared 13 times and `"Harlem"` 11
times, across operators with nothing to do with each other — and Trevor Day School (1 W 88th St) and
Broadway Dance Center (37 W 65th St) are not in Harlem. The domain-keyed fill was not propagating facts; it
was propagating a defect in the source it keyed on.

Two lessons, and the second is the sharper one:

- **A random sample is the wrong shape for detecting a REPEATED value.** Ten rows drawn from 74 are ten
  chances to see one instance each; the defect only becomes visible as a frequency. `requireSample` (v142)
  guards against trusting a count instead of the matches — it does not guard against a *sample* hiding a
  distribution. When the suspected defect is repetition, count the values; when it is a bad match, read
  the rows. Both, when the plan is small enough to print whole, which 74 was.
- **Before keying a fill on another collection, audit the collection you are keying on.** This is not the
  first bulk plan built on `providers` and it is the first to check whether the source field was sound.

### The check that agreed with itself

The natural audit of that source is "does the provider's `neighborhood` appear in its own `address`?" It
returned 22 agree / 44 disagree, and **both numbers were meaningless**.

Every "agree" row's address was the neighbourhood name: `"Downtown Brooklyn, Brooklyn, NYC"`,
`"Gowanus, Brooklyn, NYC"`. The address is *derived from* the field being checked, so the substring test is
circular and can only ever pass. And every row with a real street address read "disagree" purely because
`"Bay Ridge"` is not a substring of `"9941 Fort Hamilton Pkwy"`. The test scored placeholders as healthy and
real data as broken — exactly inverted. **A consistency check between two fields is worthless until you know
the two fields were populated independently.** 288 of 1,040 live providers carry a placeholder address, so
this was not a rare corner. Encoded as `isPlaceholderAddress` in `src/scripts/locationEvidence.ts`, with a
test that asserts the circular pass explicitly so the shape stays visible.

### What the sound checks then found — 64 records, all verified by re-reading

Three checks that rest on facts rather than on one field agreeing with another:

**1. ZIP versus stored borough (21 records).** A NYC ZIP prefix determines the borough; that is a postal
fact and outranks every field on the record. Three clusters, and one of them inverted the expected fix:

| cluster | verdict |
| --- | --- |
| Rockaway YMCA ×9 — `207 Beach 73rd Street, Arverne, NY 11692` filed under **Brooklyn** | borough → Queens, neighbourhood → Arverne. The address was right; only the borough contradicted it. |
| Imagine Skateboarding — borough literally `"Manhattan or Brooklyn"` | 10013 settles it: Manhattan / Tribeca. |
| NYC Parks ×11 — address `The Arsenal, Central Park, 830 Fifth Avenue` | **the borough was right and the ADDRESS was wrong.** Fixing the borough to match the ZIP would have moved eleven Brooklyn playgrounds to Manhattan. |

**2. The parent-HQ address, at its real size (26 records).** The Arsenal is the NYC Parks Department's own
headquarters, in the page furniture of every nycgovparks.org page. Already catalogued as a pattern; this is
its census. Each park was resolved individually against NYC Parks' own property record and **that
individually mattered** — two of the nine Brooklyn-filed parks are not in Brooklyn at all:

- **The Big Park** is in Mariners Harbor, **Staten Island**.
- **Lawrence Virgilio Playground** is in Woodside, **Queens** (and was additionally labelled Williamsburg).

All 26 now carry their real venue address, and four empty neighbourhoods were filled (Washington Heights
×3, Two Bridges) plus Samuel Seabury Playground corrected off Harlem — it is at 166 E 96th St.

**A gap in my own scan, worth naming:** the ZIP/borough check found only 11 of the 26, because it can
only see the HQ-address defect when the HQ is in a *different borough* from the venue. The other 15 are
Manhattan parks with a Manhattan HQ address, and passed. **A check keyed on a contradiction is blind
wherever the wrong value happens to agree.** The census came from querying the HQ string directly.

**3. The record contradicting its own name (20 found, 15 corrected, 5 escalated).** Free to run: does the
record's own name name a canonical neighbourhood other than the one in the field? Fifteen were resolvable
from the record alone — Asphalt Green Battery Park City filed under Financial District (212 North End Ave),
The Little Gym Dumbo under Brooklyn Heights (75 Front St), NYC Elite Gymnastics Tribeca under Upper West
Side (44 Worth St), My Gym Park Slope under DUMBO, and so on.

**The first row is the one that shaped the rule.** *Williamsburg Soccer Club* is filed under Greenpoint, and
Greenpoint is **correct** — the WSC Clubhouse at 33 Nassau Ave is in Greenpoint, and "Williamsburg" is the
club's brand. A name-wins rule would have broken a field that was already right. So the ordering is
**address > name > stored field**, the name is consulted only when the address cannot answer, and when a
street address and a name disagree outright *neither wins* — that is a `needs_human`, because an address
can be a head office just as a name can be a brand. `judgeLocation()` encodes this with the Williamsburg
case as its regression test.

The five escalated: Williamsburg Soccer Club (confirmed, no change), Sugar Hill Children's Museum (both
values defensible — Sugar Hill sits within greater Harlem), Physique Swimming Battery Park City (a
three-way conflict between name, field and a 24 Maiden Lane office), "Uws & Midtown Nyc Family Events" (its
own name is a compound), Riverdale Summer Camp (Riverdale vs Kingsbridge, adjacent, no address to break it).

### The shared default, and how to tell one from a popular neighbourhood (18 records)

`address: "Manhattanville, Manhattan, NYC"` + `neighborhood: "Harlem"` sat byte-identical on **18 unrelated
live providers** — a tutoring company, a dance school, two soccer clubs, a language school, a chess
programme, two school-yoga nonprofits. Confirmed false for Broadway Dance Center Children & Teens, which is
at 37 W 65th St in Lincoln Square.

**What makes this a default rather than a coincidence is the FIELD, not the count.** Thirty children's
businesses really are on the Upper West Side, and `"Upper West Side, Manhattan, NYC"` appears 33 times
without that proving anything. But a full ADDRESS should be near-unique, so eighteen operators sharing one
is structural. `sharedDefaults()` therefore takes a threshold rather than hard-coding one — the right count
depends on what the field is.

Seventeen had both fields cleared; Broadway Dance Center got its real address. **Cleared, not replaced** —
the same discipline as the undialable-phone sweep. And a note for the next pass is on each record: a
striking share of this cohort are in-home or in-school operators with no venue of their own, which is
plausibly *why* the extractor had nothing to read and reached for a default. Check the no-fixed-venue
prohibition before hunting for an address that may not exist.

### Totals

| action | records |
| --- | --- |
| ZIP-contradicted borough corrected | 10 |
| Parent-HQ address replaced with the real venue address | 26 |
| Neighbourhood corrected from the record's own name/address | 15 |
| Fabricated shared-default location cleared | 17 |
| Real address written from an independent source | 1 |
| Reviewed, verdict `needs_human` | 5 |
| **total live provider records actioned** | **64** |

Every one dry-run first and verified by re-reading the database rather than by parsing the write response.

### Code

`src/scripts/locationEvidence.ts` + 12 tests: `zipBorough` (declines rather than guesses — Fort Lee NJ and
Long Island return null, which is the four-times-confirmed Borough-taxonomy gap showing up as an honest
absence), `extractZip`, `isPlaceholderAddress`, `sharedDefaults`, `judgeLocation`. Deliberately **no**
ZIP→neighbourhood map: NYC ZIP boundaries and neighbourhood boundaries genuinely disagree, and the
21-entry hand-built map found in the scratchpad had 11225 as "Prospect Heights" and 11206 as
"Williamsburg", both wrong. A map that is 80% right is worse than no map, because it writes with
confidence.

## v145 (2026-08-09): the quarantined-twin cross-collection check, and 92 real neighbourhoods

Continues v144 under the owner directive to store real neighbourhoods. Two distinct pieces of work.

### Real neighbourhoods: 29 → 92 of the 345 group-valued providers

Tier 2 extended the blanket ZIP rules (10026/10030/10037 → Central Harlem, 10065 → Lenox Hill, 10017 →
Midtown East, 10028 → Yorkville). Tier 3 stopped using the ZIP at all where it straddles, and resolved
from the address using **Manhattan's house-numbering convention**: on an East Side numbered street 200+ is
east of Lexington and 300+ east of Third, which is exactly the Carnegie Hill / Yorkville line inside
10128; W 72nd St is the Lincoln Square / Upper West Side line inside 10023.

**Two ZIPs were in the tier-2 draft and removed on inspection**, which is the reason to read a plan rather
than run it: 10022 straddles Midtown East and Sutton Place (488 E 60th St, under the Queensboro Bridge, is
Sutton Place) and 10019 straddles Midtown West and Hell's Kitchen (810 7th Ave at 53rd is not Hell's
Kitchen; 445 W 54th is). Their four records were resolved per address instead.

**The bug worth the whole section.** The tier-3 avenue matcher listed `york` as an alternative, for York
Avenue. `\byork\b` matches the **"York" in "New York"** — so every address in Manhattan looked like it
named York Avenue, and all of Carnegie Hill was about to be filed as Yorkville. This is the same substring
false positive `src/scripts/scanGuards.ts` was written to prevent **two commits earlier, in this same
sweep**. A guard only helps where it is called; writing a fresh regex by hand reintroduced the class it
exists to stop.

Two details make it worse than an ordinary slip. It produced a **correct answer for one record by
accident** — 431 E. 91st really is Yorkville — so the output read plausibly. And it was caught only by
spot-reading two rows (17 E 89th, 24 E 95th) whose house numbers were obviously west of Third. Now
`stripCityStateTail` and `manhattanCrossStreet` in `locationEvidence.ts`, with the naive regex asserted
*failing* in a test. **When an address is the haystack, strip the ", New York, NY 10128" tail first.**

Deliberate non-actions, all recorded rather than silently dropped: 13 records whose address is a bare
avenue ("334 Amsterdam Ave") keep their coarse value, because an avenue address carries no cross-street
evidence at all; W 72nd addresses stay Upper West Side rather than being claimed for Lincoln Square, since
a boundary street belongs to the coarser side; and Music to Your Home is skipped entirely because it
teaches in families' own homes, so 235 E 95th is an office and **an administrative office is not a
location**.

### A new cross-collection check: cards whose only provider twin is quarantined

Found by accident and then run deliberately. `apple seeds` was **`PUBLISHED` as a content card while its
own provider record had already been quarantined for permanent closure** — quarantining a provider does
not quarantine its card, and nothing in the schema links the two.

Querying that shape pool-wide: **34 hosts where every provider is quarantined and no live provider
remains; 12 of them still carry a maintainable content card; 18 cards, 12 of them `PUBLISHED`.**

**It is a lead generator, not a bulk action, and the list proves it.** Four of the 18 are Tennis
Innovators cards that are the *correct output* of an earlier split — the parent was quarantined precisely
because its children now exist. Bulk-acting on this signal would have undone real work. Two more (The
Coding Space) name genuinely real centres while the quarantined twin claimed an Upper West Side location
the operator does not have. So each was checked individually:

| card | verdict |
| --- | --- |
| apple seeds (`PUBLISHED`) | **QUARANTINED** — closed; own domain no longer resolves, Yelp marks both sites CLOSED, Time Out confirms |
| The Play Lab Williamsburg (`PUBLISHED`) + Brooklyn | **QUARANTINED** — closed 24 Oct 2025, reported by Greenpointers |
| The Paint Place UWS (`PUBLISHED`) | **QUARANTINED** — Time Out lists it CLOSED. Needed its own check: the quarantined twin was *The Paint Place Brooklyn*, a different location |
| Big Apple Swim School Brooklyn (`PUBLISHED`) | **QUARANTINED** — no such business; token match on "Big Apple" to a K-8 private school |
| Cocoon NYC (`PUBLISHED`, `categoryHint: Indoor Play`) | **QUARANTINED** — prenatal/postpartum wellness for women, and livestream/on-demand. Adults-only *and* no physical venue |
| New York Loves Kids (`PUBLISHED`) | **BLOCKED_TERMINAL** — a directory's own brand name; the article's real subject, Kidville UWS, already has a card |
| 2026 Bronx Summer Camps (`PUBLISHED`) | **BLOCKED_TERMINAL** — a camp guide, not a camp |
| South Brooklyn United (`PUBLISHED`) | **BLOCKED_REPAIRABLE** — real club, sourced to a HOSPITAL (`nychealthandhospitals.org/locations/south-brooklyn-health/`) on the token "South Brooklyn" |
| The Coding Space UES + Park Slope | **re-sourced** off the root domain to their real per-location pages |
| Tennis Innovators ×4 | **no action** — correct output of an earlier split |

Also fixed on the way through: "Edgies Teen Center / Shorefront Y kids programs" mashed **two unrelated
organisations** and took its location from the wrong one — it was filed in Brooklyn / Brighton Beach (the
Shorefront Y) while its source is `mannycantor.org/teen-center/`, the Manny Cantor Center at 197 East
Broadway on the Lower East Side. Retitled and relocated to the one organisation the source describes, with
the Shorefront Y recorded as a separate card candidate. Its `categoryHint` was also null despite being
writable — set, per the content-quality mandate.

### Totals

104 records: 92 real-neighbourhood refinements, 4 closure quarantines, 3 further quarantines, 2 terminals,
1 repairable, 2 re-sourced, 1 mashup repaired. Every one dry-run first and verified by re-reading.

## v146 (2026-08-09): batch curation, seven batches, 45 listings — and what each batch taught the queue

Owner directive: work 4–10 listings at a time, every component, and after each batch turn what was found
by hand into a measurement. This replaced a stretch of single-field cohort sweeps that had run hundreds of
`neighborhood`-only writes and **zero descriptions**.

### The queue changed

`updatedAt` is dead as a queue — this project's own bulk sweeps touched most of the live pool, so "oldest
updated" surfaces records the loop wrote minutes earlier. The queue is now worst-first by defect signal
(`src/scripts/providerSignals.ts`), with a `batch_done` set, because fixing a record rarely clears every
signal on it (an operator who publishes no email still trips `email_missing` after a perfect review).

Baseline across 1,040 live providers: 497 missing email, 343 descriptions under 120 characters, 317
missing phone, 270 placeholder addresses, 222 missing neighbourhood, 125 with short and long
byte-identical, 63 sharing a stock banner. **145 records trip nothing.**

### Signals each batch added

| batch | found by hand | now measured |
| --- | --- | --- |
| 1 | AYDT's short and long were the same 104-char filler | `desc_identical`, `desc_tiny` |
| 1 | Kids in Sports UES carried Hungarian YouTube Kids boilerplate | `desc_not_english` |
| 1 | `csny-banner-dance.png` on two unrelated studios | `image_shared` (63 records, 16 files) |
| 2 | Chess at Three's description was a University of Memphis STATISTIC | `desc_is_a_claim` |
| 3 | Creative Kitchen's phone had area code 238 — unassigned, but NANP-shaped | `isDialablePhone` |
| 3 | "Multiple Brooklyn locations" as an address | `isDeliveryModelAddress` |
| 6 | Brooklyn Design Lab's copy was INDONESIAN — no accents, so `desc_not_english` missed it | widened |
| 7 | Textile Arts Center's descriptions were raw GZIP BYTES | `desc_binary` |

**The Indonesian widening is the instructive one.** Adding a bare accented-character class produced
**seven false positives out of nine** — ordinary NYC copy is full of accents (Lycée Français, Gjøa, café).
The fix was to require TWO distinct foreign function words: Brooklyn Design Lab has five, while Anderson's
Martial Arts Academy has one ("Sifu/Guru Dan", a person's name) and is correctly ignored. **Widening a
detector is not free, and the cost shows up as false positives on exactly the records that were fine.**

### Contamination lives in `providers`, not just `contentCards`

The reference-host check had only ever been run on cards. Run on providers it found **seven of 1,039**, and
on providers it is worse — providers carry descriptions, so the article's text becomes the business's own:

- **Asphalt Green Youth Tennis** → `en.wikipedia.org/wiki/Asphalt_concrete`, the article on ROAD SURFACING.
  Its description was a passage about the Nazis barring Jewish children from school, and George Soros.
- **NY Sports 4 Kids** → `nytimes.com`, the homepage. Its description was that day's headlines.
- **Downtown United Soccer Club** → `/wiki/Downtown`. Its ADDRESS was the fragment `"2 million square"`.
- **Manhattan Youth** ×2 → `/wiki/Manhattan`. Both carried the same Washington DC phone number, which is
  what condemned it: a number on two unrelated records is a scrape, not a number.

All seven name real operators, so all seven were **re-sourced and rewritten, never quarantined** —
entity-before-domain. Three further contamination cases were quarantined because no entity exists behind
them: an **NCAA March Madness bracket article** live as a Gymnastics provider on the Upper West Side; a
**city-rankings publication** whose description was Los Angeles real-estate news and whose address was "5
Times Square" while its neighbourhood said Harlem; and a **Bronx facts listicle** whose address was the
fragment `"1520 Sedgwick Avenue, the birthplace of hip hop in the Bronx. Fact"` — with the word "Fact"
still attached.

### Cluster resolution: build-then-retire, twice

**Gjøa** (4 records, 1 club) and **Tim Morehouse Fencing Club** (6 records, 3 studios). In both, the venue
record was corrected onto a real address FIRST, and only then were the programme records hidden — hidden,
not quarantined, because a programme card is "no separate place", not forbidden content.

TMFC showed both sides of the escape hatch in one cluster. Its **Teen Program** record was the only one
covering the East Side salle, so hiding it would have removed a real studio from the pool — it was
**repurposed into that studio's venue card** instead. And its **Starter Program** record, whose address was
the compound "Upper West Side and Midtown East locations", was **repurposed onto 210 West 91st Street**, a
third studio with no card at all.

**A negative result that nearly cost a real location:** 2710 Broadway looked stale, because the club's West
Side page also names 210 West 91st Street. Reading the page rather than the extract showed both are
current — "summer camps are in session at two Upper West Side studios". Moving that studio would have sent
families to an address it never had.

### A new out-of-market shape

**Manhattan Patriots Football & Cheer** is in Manhattan, **ILLINOIS**. Confirmed on the operator's own
site: it practises at Manhattan Intermediate School and plays home games at Lincoln-Way West High School,
both Will County. Every previously catalogued out-of-market case was a business in a nearby real market
given a fabricated NYC borough; this is a **token collision on a place name**, where the borough field is
not fabricated so much as the right word for the wrong Manhattan. Nothing on the record looks wrong. Only
reading the venue names catches it.

### Deliberate non-actions

Creative Kitchen has TWO real Manhattan studios (270 Greenwich St, 226 E 57th St), so its address was left
EMPTY and both were recorded — writing one would tell a family the other does not exist. Bed-Stuy Sports
and Brooklyn Crescents play on public fields and publish no home ground, so their placeholders stand.
Baby Fingers is filed under Music because this platform's activity vocabulary has no sign-language value —
recorded as a vocabulary gap rather than silently mislabelled. NYC Parks Afterschool Program is
`needs_human`: it is a citywide programme index whose borough is the compound "Manhattan or Brooklyn", and
picking one borough would tell families in the other four that nothing runs near them.

## v147 (2026-08-09): batches 8–10 — the citywide-programme-index cohort, cleared

### The cohort

Batch 9 kept producing the same shape — a real, free, valuable programme with a delivery-model address and
a compound borough — so it was measured instead of worked one at a time. **Thirteen live providers carried
the byte-identical borough string `"Manhattan or Brooklyn"`.** Identical value across unrelated operators
is the run-level-default signature already catalogued for `"East New York"` and `"Manhattanville, Manhattan,
NYC"`, and this one is false twice over: it names no single place, and every programme in the cohort runs
in more than two boroughs.

**A claim in the first version of this section was wrong and is corrected here.** It said the value was
"now rejected on write". It was not: `validateWriteRequest`'s compound separator list covered `/`, `and`,
`&` and `+` — **but not `or`** — so the write path would have accepted `"Manhattan or Brooklyn"` right
back in. The owner caught it. `or`, `;` and `|` are now in the list, with regression tests, and all 341
canonical place names were re-checked against the widened guard (zero wrongly rejected). The general
lesson: **cleaning the rows is not the same as closing the hole, and a guard is only as good as the
separators it enumerates.**

It split cleanly in two.

**Five satellites that said so themselves.** Their own descriptions read *"See the Imagine Swimming
listing for the pool where this runs"*, *"A Soccer Stars programme; see the Soccer Stars NYC listing"*,
*"A programme at the Police Athletic League; see the PAL Sports Leagues listing"* — a card telling the
reader to go and look at a different card is a card admitting it should not exist. Retired to **hidden**,
not quarantined, and only after confirming each parent exists (Imagine Swimming has three real location
records; Soccer Stars NYC has four; PAL Sports Leagues is kept live in the same batch as the parent).

**Eight genuine citywide programmes** — Rising New York Road Runners, PAL Sports Leagues, Cornerstone (94
NYCHA community centres), Beacon (80 school-based centres), NYC Parks Afterschool, NYC Parks Youth Swim
Team, Rising NYRR Wheelchair, Kids in Motion. **Borough cleared, not replaced.** There is no single borough
to write, and picking one tells families in the other four that nothing runs near them. An empty field is
an honest absence; `"Manhattan or Brooklyn"` was an assertion that excluded three boroughs. All kept live —
these are free public programmes and among the most useful listings in the catalogue.

**Rising NYRR Wheelchair Training Program was explicitly protected.** Its data is genuinely weak and the
temptation is to tidy it away, but it is a free adaptive running programme for young people with physical
disabilities, there are very few such listings, and thin data still serves that family better than no
listing. The no-fixed-venue prohibition is about businesses with no location at all, not about a free
programme whose sites rotate seasonally.

Compound boroughs remaining in the live pool: **zero**.

### Also in these batches

- **CompleteBody Kids / Kids Sports NYC** was still live. Its own scraped description is the real business:
  *"Premium gym in NYC with 5 Manhattan locations… saltwater pool, rock climbing wall & Himalayan salt
  lounge."* A Himalayan salt lounge is not a children's activity. Sibling copies were quarantined in an
  earlier pass and this one was missed — the signal queue found it.
- **Peter Stuyvesant Little League**'s descriptions were an encyclopaedia passage about the *housing
  complex* ("built during the 1940s for returning World War II veterans"), from the catalogued
  `/wiki/Saint_Peter` token match. Its `website` field was empty; set to psll.org.
- **Evolutionary Martial Arts** said Upper West Side while its own address said 64 E 4th Street — four
  miles apart, resolvable with no research — and was sourced to findglocal.com, a directory. Its
  description was a social-media post: *"Saw 'Star Wars?' Well, we fixed that and had a big fun class
  beforehand."*
- **Lula Washington Dance Theatre** is `needs_human` on a genuine LA-VOCABULARY GAP, not a defect: 3773
  Crenshaw Blvd is in South LA, and this platform's LA taxonomy has no South LA area — its ten areas run
  from Central LA to Antelope Valley with nothing covering Crenshaw. Recorded alongside the standing NYC
  Borough-taxonomy gap.
- **Premier Martial Arts Brooklyn Heights** got its real address (75 Smith St) but its neighbourhood was
  deliberately NOT changed: 75 Smith Street is arguably Boerum Hill while the studio's own name and every
  directory say Brooklyn Heights. That is precisely the address-versus-brand tie `judgeLocation` refuses to
  break automatically.

## v148 (2026-08-09): batches 11–12, and the hole the cohort sweep left open

**The compound-place guard did not list `or`.** SOP v147 said `"Manhattan or Brooklyn"` was "now rejected
on write" and it was not — `validateWriteRequest`'s separator list covered `/`, `and`, `&` and `+` only, so
the string thirteen providers had just been cleaned of would have been accepted straight back in. The owner
caught the false claim. `or`, `;` and `|` added, all 341 canonical place names re-checked against the
widened guard (zero wrongly rejected), regression tests for every separator plus the empty value that must
stay allowed. **Cleaning the rows is not the same as closing the hole**, and a sentence asserting a value is
now impossible needs a test behind it before it is written.

Re-running the widened guard over both collections then found what it would now reject: **providers zero,
content cards 130.** Seventeen were mechanically resolvable and were fixed — six `boroughGuess` values like
`"Manhattan / NYC"` where stripping the non-place noun leaves one real borough, and eleven
`neighborhoodGuess` values like `"NYC / Manhattan"` where stripping it leaves a BOROUGH, which is not a
neighbourhood and was therefore **cleared** rather than written one column to the right.

The remaining 113 are dominated by `"Manhattan/Brooklyn"` ×51. Two things worth recording about that
cohort so the next pass does not re-derive them: **none is published** (44 DISCOVERED, 6
BLOCKED_REPAIRABLE, 1 PARKED), so there is no live harm; and **50 of the 51 titles name no location at
all**, so it cannot be resolved mechanically and needs per-card sourceHost research.

### Batch 12

- **Tinkergarten Manhattan** quarantined under the physical-only rule in its clearest form: independent
  leaders running classes in whatever public park is near them, coordinated by a company in Columbus,
  Ohio. Distinct from the hybrid case (a real venue that also runs outdoor sessions) and from a league on
  public fields (which plays at identified grounds) — here the park changes with whoever is leading.
- **"West"** — a record whose name is one word and whose own description already read *"A multi-provider
  summer camp round-up page, not a single business."* A previous pass diagnosed it and left it live. Its
  activityTypes and all five age buckets are the union of everything the round-up listed, which is what a
  directory page looks like when mistaken for a provider.
- **Tribeca Performing Arts Center**'s address said Chelsea while its neighbourhood said Tribeca — the
  neighbourhood was the right half — and its description was a sales banner with no subject: *"2026-27
  Family Events and Memberships On Sale Now!"*
- **The Painted Cloud**: sources disagree between 156 S 2nd St and 168 Marcy Ave. The more recent was taken
  and **the disagreement recorded on the record** rather than silently resolved; they are a block apart and
  the older is most likely a previous door.
- **Tiny Scientist** and **Premier Martial Arts** show a small discipline worth naming: where the
  `shortDescription` was already good and only `longDescription` duplicated it, the short one was KEPT and
  only the long one written. Rewriting both because a signal fired would have thrown away good copy.

### Where the pool stands after 12 batches

75 listings worked — 41 corrected, 24 should-not-exist, 7 needs_human, 3 confirmed — with
**33 long and 31 short descriptions rewritten**, 23 addresses, 20 phones, 16 re-sourced websites, 24 age
ranges, 6 renames. Live visible providers: 820. Records tripping none of the five core copy/contact
signals: 272.

## v149 (2026-08-09): the 51-card `Manhattan/Brooklyn` cohort, researched and closed

Owner: *"Research that 50 and fix them as well."* All 51 worked; **45 resolved, 6 left `needs_human`.**

### Why one discovery run produced 51 identical compound boroughs

Not a coincidence alongside the field defect — the *cause* of it. The cohort turned out to be dominated by
two business models that have no single address for an extractor to read, so it fell back to a compound:

**1. Party entertainers (19 cards).** Magicians, clowns, character performers, bubble acts, a puppet
company, a party fairy. A performer travels to whatever venue the family books, so there is no location to
assign a borough to. All quarantined under the physical-only rule — except three whose sites return
nothing readable, which were left `needs_human` rather than swept in on the cohort's dominant shape,
because *"this cohort is mostly X"* is not evidence about any individual record.

**2. Clubs that train in rented school gyms (7 cards).** Big City Volleyball (75 Morton St, Sacred Heart at
406 E 91st, Dalton at 200 E 87th), High Octane (Marymount, 215 E 94th, 980 Park Ave), NYC Juniors (six
Manhattan venues plus 100 Dobbin St in Greenpoint), Dribbl, Swim Easy (109 E 50th plus the Léman pool at 25
Greenwich St), British Swim School. These are **in scope** — a continuing programme at a fixed address is
the Physique Swimming shape — but they run at several borrowed gyms at once. Two of them turned out to be
**Manhattan-only**, so the Brooklyn half was simply wrong; the genuinely two-borough ones had the borough
**cleared with every confirmed venue named**, per the directive that premises in two boroughs are two
listings.

### The rest

| verdict | cards | examples |
| --- | --- | --- |
| Borough corrected to a single real one | 8 | Amaze Light Festival and NY Hall of Science → **Queens** (both ZIP 11368, Corona); New Heights → Crown Heights (1561 Bedford Ave, the Bedford-Union Armory); Barcelona SC → Bushwick (238 Wyckoff Ave); play:groundNYC → Manhattan (The Yard, 40 Barry Road, **Governors Island**) |
| Quarantined — out of scope | 5 | **Balloon Saloon**, a real Tribeca business but a party-SUPPLIES SHOP, not an activity; **NY Party Works**, inflatable hire in Deer Park, Long Island; **Volo Kids**, public parks with HQ in Baltimore; **Story Pirates Creator Club**, explicitly a Zoom subscription |
| Terminal — no entity to maintain | 7 | root-domain duplicates (SwimJim, and the root twins of NYC Impact and Lil' Kickers), programme cards (Taste Buds birthday parties, Super Soccer Stars birthday parties), the NYC Parks youth-sports INDEX, and a single dated **event** listing (Jesse Owens Track, `/events/2026/05/09/`) |
| `needs_human` | 6 | three entertainers whose sites return nothing; Eleven United, which may not exist (searches surface two *different* United clubs); Spanish Workshop, which collides with three similarly-named orgs; NYC Youth Football League |

### Three judgements worth keeping

- **Balloon Saloon had to be decided on what the business DOES, not on whether it is real.** It is real,
  local, well-known and beloved — and it sells balloons. Retail is not an activity a child attends.
- **Silly Billy has a street address and was still quarantined.** 10 West 15th Street is a magician's
  office. An administrative office is not a location, and writing "Chelsea" would send a family to a door
  they cannot use. The address is what made this one look resolvable.
- **Governors Island is not in the neighbourhood vocabulary**, so play:groundNYC's borough was set and its
  neighbourhood deliberately left empty. Third vocabulary gap recorded this run, after Crenshaw (no South
  LA area) and the standing Borough-taxonomy gap.

## v150 (2026-08-09): a fabricated cluster, and two of my own writes that made it worse

### Nine invented businesses, found by the absence of a website

Working the signal queue turned up a run of records with a shared signature: **no website at all, no
phone, no email, a generic `<Place> <Sport> <Club/Academy>` name, and a plausible street address.** Ten
live providers matched. Independent searches were run for each business AT its stored address and **nine
of them do not exist**:

Upper West Side Gymnastics (415 Amsterdam Ave) · West Village Youth Soccer (75 Jane St) · Brooklyn
Baseball Academy (8503 3rd Ave) · Red Hook Youth Soccer (1 Clinton St) · Upper East Side Tennis Club (321
E 72nd St) · East Village Soccer Academy (138 St Marks Pl) · Riverside Youth Lacrosse · Brooklyn Running
Club Youth (78 Atlantic Ave) · Brooklyn Dance & Sports Club (148 Court St).

Real organisations of adjacent names exist for several — Brooklyn Kids Run, Sweat FC's Red Hook classes,
78 Youth Sports — which is exactly what makes the invented ones read as plausible.

The tenth, **Brooklyn Lacrosse Club Youth**, was retired rather than quarantined: that club is real, has
three properly-sourced records including 334 Furman Street, and this fourth record simply carried the
same fabricated-address shape attached to a genuine operator.

### Why this cluster survived every previous sweep

**A fabricated record with a real-looking street address passes every field-level check.** No placeholder,
no compound, no missing location, no scraped chrome, no non-English copy. On the signal queue it looked
*better* than the honest records around it. The only tell is the absence of a source — and `website_missing`
had been sitting in the signal list as a minor completeness gap. It is now documented as the strongest
fabrication signal in the set.

### Two writes of my own that made fabricated records look more credible

Both reversed the same day, and both worth recording because the failure is identical:

- **West Village Youth Soccer**: earlier in this run I "corrected" its neighbourhood from Greenwich
  Village to West Village, reasoning that 75 Jane St (10014) is in the West Village. The address is
  invented.
- **Brooklyn Basketball League**: I set its empty neighbourhood to Crown Heights from its stored 789
  Eastern Pkwy, and wrote that the other fields were "checked and left". They were not read — its website
  is `nhl.com/rangers/community/youth-hockey`, the Rangers' youth HOCKEY page on a basketball card, and
  both descriptions are NHL.com chrome.

**Improving one field on a record whose reality has not been established makes a fabricated record look
more credible, not less.** A precise neighbourhood on invented content is the precision-in-a-wrong-claim
rule turned on my own work. The reality check is the first rule in `CLAUDE.md` for a reason, and a
plausible address is precisely what makes it feel skippable.

### Two more scans this produced

- **Website host is a major media/platform/directory domain.** Three live providers. One was the NHL case;
  the other two were duplicates whose better-sourced twin already existed (Brooklyn Nets Youth Basketball
  on `nba.com`, Bed-Stuy Sports Flag Football on a `brooklynbridgeparents.com` round-up that also had it in
  DUMBO). Worth running on `providers` and not only on cards, because a provider carries descriptions and
  the host's chrome becomes the business's own copy.
- **A record whose own description points at another listing.** Eight found and retired to hidden, each
  after confirming the parent exists. Re-scan returns zero; cohort closed.

### A queue defect

`signals.py` excluded `qualityStatus: quarantined` but not `visibility: hidden`, so **209 of 1,029**
records it was serving had already been retired by this loop. When a queue and a retirement mechanism key
on different fields, the queue has to know about both.

Live providers with no website: **10 → 0.** Live provider pool: 806.

## v151 (2026-08-09): batches 27–28 — the shared-address scan, and 31 records for 11 real venues

Batch 27 was drawn from the signal queue as usual. Batch 28 was drawn from a scan that batch 27's
retrospective produced, which is the first time in this loop that a hand-worked batch has fed the *choice*
of the next batch rather than only its ordering.

### Batch 27: two clusters and a park, 13 records

| Record | Verdict | What was found |
| --- | --- | --- |
| `prov-chelsea-piers-field-house` | corrected | Surviving venue. `category`/`programType` both read **Birthday Parties** for an 80,000 sq ft sports centre; long description extended to name the five camps that were separate cards |
| `prov-chelsea-piers-golf-camp-31001228` | corrected | **Retitled** to *The Golf Club at Chelsea Piers*, Pier 59, 212-336-6400 — a real venue in the complex with no card |
| ×6 Chelsea Piers camp/academy records | should_not_exist | Program cards at `62 Chelsea Piers`, the Field House's address |
| `prov-brooklyn-youth-sports-club` | corrected | East New York + `653 Schenck Ave, Brooklyn, NY 11207` + `information@bkysc.org`, both descriptions rewritten |
| `prov-brooklyn-youth-sports-club-volleyball-…` | should_not_exist | Program card, same address; its email was harvested first |
| `prov-brooklyn-youth-sports-club-da7d8e29` | should_not_exist | Third copy, address `Brooklyn, NY`, description opening on "The Garden quickly became one of our most engaging classrooms" |
| `prov-bryant-park-kids-events` | corrected | Real park, real free kids programming; `Birthday Parties` → `Drop-In Activities`, placeholder address replaced, 212-768-4242 + info@bryantpark.org added, copy replaced (it was adult yoga sponsorship chrome) |
| `prov-camp-kids-club-ny-preschool-kids-club` | should_not_exist | Program card; the real Tribeca venue is carded at 88 Leonard St |

Nine of thirteen were surplus. Chelsea Piers alone had **seven records for one building**, and two of them
carried `/fieldhouse-chelsea/summer-camps/…` in their own `website` field — the records saying, in their
own data, that they are programmes of a venue that already has a card.

### The scan the retrospective produced

Group live providers by street address, normalised for suffix spelling, punctuation and the city/state/ZIP
tail, and drop placeholders. **589 of 1,087 live providers carry a real street address, and 100 of them sit
on an address another live record also claims — 46 clusters.** `src/scripts/addressClusters.ts`.

The uncomfortable part is that this repo had already observed the signal and could not act on it. SOP and
`CLAUDE.md` both record that the address-fill pipeline *refused* to write a street address another listing
held, and that all 41 refusals were real findings. A refusal fires only when something tries to write. The
clusters already sitting in the catalogue were invisible to it. **When a guard's refusals turn out to be
findings, run the guard's own test as a standing scan.**

Two limits are deliberate and both are asserted in tests. A cluster is a lead, not a verdict — Pier 40 (353
West St) genuinely houses Downtown United Soccer Club, the Village Community Boathouse and Pier 40 Baseball.
And the `one-operator` / `mixed` classifier under-counts: it compares leading name tokens, so the three
Marlene Meyerson JCC records read `mixed`. **`mixed` means unresolved, not cleared.**

### Batch 28: the seven largest clusters, 18 records, 7 survivors

| Cluster | Records | Outcome |
| --- | --- | --- |
| `579 Vanderbilt Ave` — Gymstars Brooklyn | 3 → 1 | Two program cards sharing one byte-identical scrape and a stale phone/email pair |
| `334 Amsterdam Ave` — Marlene Meyerson JCC | 3 → 1 | Day Camp and Sports retired; `Camps` → `Classes`; JCC Harlem noted as an uncarded second location |
| `212 North End Ave` — Asphalt Green BPC | 3 → 1 | Survivor's long description was **6,710 characters of navigation chrome**, the largest such block found in this pool |
| `1395 Lexington Ave` — 92NY | 3 → 1 | Harkness Dance Center retired as a division; **Camp Yomi retired as out of taxonomy** |
| `100 Jay St` — Tutu School DUMBO | 2 → 1 | Camp retired, `twirl@tutuschooldumbo.com` harvested first |
| `43-44 12th St` — Tutu School LIC | 2 → 1 | Both records accurate; a plain duplicate |
| `299 South St` — Basketball City | 2 → 1 | League program card retired |

Every cluster was **build-then-retire**: three emails and one ZIP moved onto survivors before their
siblings were hidden.

### Four things worth carrying

- **Two records in one cluster can have their descriptions SWAPPED.** The JCC venue record described the
  day camp; the day camp record described the centre. Both read well, both pass every length, language and
  chrome check. Only reading a description against its own record's *name* catches it.
- **The field can be right and the copy wrong.** Gymstars' `neighborhood` said Prospect Heights and its own
  short description said "in Fort Greene". 579 Vanderbilt Ave is Prospect Heights. Every previously
  catalogued disagreement of this shape had the field wrong, and `judgeLocation()` only reads fields.
- **An HQ address can sit on a programme with no in-taxonomy site to correct to.** Camp Yomi stored 92NY's
  Manhattan building; the camp is 50 acres in Rockland County. Fifth instance of the HQ-address pattern,
  first one that could only be retired.
- **A sub-address token can be the whole difference between a venue and a duplicate.** `62 Chelsea Piers`,
  `61 Chelsea Piers` and `Pier 59` are the Field House, Sky Rink and Golf Club. A normaliser aggressive
  enough to fold "Chelsea Piers" together would have retired two real venues; the test asserts they stay
  apart.

Remaining after batch 28: **39 shared-address clusters, 82 live records.**

## v152 (2026-08-09): batches 29–30 — 41 records, 21 venues, and where the cluster scan stops being mechanical

Batches 29 and 30 both came from `addressClusters()`. Together with batch 28 they took the pool from **46
clusters / 100 live records to 21 clusters / 43 records.**

### Batch 29 — ten one-operator clusters, 20 records

Straightforward program-card retirements at ten addresses, all build-then-retire. Five of them turned on a
judgement worth recording rather than on the duplicate itself:

- **`5 W 63rd St` — a CHAIN-LEVEL record parked on a branch's address.** The sibling of West Side YMCA was
  literally named "New York City's Ymca" — the YMCA of Greater New York, 24 branches — sitting on this one
  branch's street address, with `theschulberts@gmail.com`, a **personal Gmail account**, as the YMCA's
  contact. Same shape as a franchisor's root domain standing in for a branch.
- **`140 Flatbush Ave` — right name beats richer fields, again.** The operator's own site is titled
  *Brooklyn Basketball* and calls itself "the official youth basketball program of the Brooklyn Nets and
  New York Liberty", so the sibling's name — *Brooklyn Nets Basketball Academy* — is a description of the
  backing, not a business a family could ask for at the door. The sibling was the better-populated record;
  its copy was folded into the canonical one before retirement.
- **`630 Sackett St` — the field/copy split, reversed.** Stored neighbourhood said Park Slope; the record's
  own researched description said "a Brooklyn dojo in Gowanus". 630 Sackett is between Third and Fourth
  Avenues, so the copy was right and the field was wrong — the opposite of Gymstars in batch 28, and both
  invisible to `judgeLocation()`, which only reads fields.
- **`2280 Frederick Douglass Blvd` — two live records with the BYTE-IDENTICAL name and address.** Nothing
  but a name or address scan surfaces that.
- **`250 W 86th St` — a reality check that came out the other way.** Crossbar's descriptions were full of
  "Order Now Menu Trivia Karaoke", which reads exactly like the Equinox "Kids Club" case — a bar with an
  amenity mislabelled as children's provision. It is not: Crossbar publishes toddler open-play soccer
  sessions every weekday 9am–12pm, $10 a child, on its own indoor field. Real programme, real fixed
  address. Its sibling was named **"Crossbar (new)"**, which is the suffix on every page title of the
  site's template — the same defect family as the "New" and "And" titles.

### Batch 30 — the `mixed` clusters, 21 records

Deliberately took the clusters the classifier could not resolve. They split three ways, and the third is
why `mixed` can never be swept:

1. **Genuinely shared buildings.** Pier 40 (353 West St) holds four records and only ONE is a duplicate —
   Downtown United Soccer Club has two cards, while the Village Community Boathouse and Greenwich Village
   Little League are separate real organisations at the same pier. Confirmed and left. Likewise Big City
   Volleyball renting Congregation Beth Elohim's gym at 274 Garfield Place: two real operators, both kept.
2. **One operator behind two names** — FunFit Kids / "Kids Multi", SwimJim twice, Prospect Gymnastics /
   "Coney Island Gymnastics Prospect".
3. **A real second operator sharing an address with a duplicate PAIR.** 752 West End Avenue holds both of
   FunFit's cards *and* Imagine Swimming, which rents the pool in the same building. You cannot act on the
   cluster, only on records inside it.

Three findings from it:

- **"Kids Multi" is not a business.** The operator's own page title is "Kids Multi-Sport Program | New York
  | FunFit Kids" — the card's name is the first two words of a title tag. Fifth instance of the
  title-fragment-as-business-name defect.
- **"Coney Island Gymnastics Prospect" was sitting on the real gym's own address.** 1023 Church Avenue is
  Prospect Gymnastics in Ditmas Park; the sibling claimed the neighbourhood Coney Island, five miles away.
  An earlier pass quarantined a Coney Island Gymnastics card elsewhere for the same fabrication; this one
  was hiding inside a real business's address cluster.
- **A ticket type is not a place, and neither is a park.** The New York Botanical Garden's venue record was
  named "New York Botanical Garden — NYC Resident Grounds Access" with `primaryActivityType: "Botanical
  garden"`. Renamed and re-typed — but its neighbourhood was deliberately **left empty and marked
  needs_human**, as were the Bronx Zoo's and Bronx House's: NYBG and the zoo occupy their own acreage in
  Bronx Park bordering three neighbourhoods without sitting in any, and 990 Pelham Parkway South sits on a
  boundary this platform's Bronx vocabulary has no entry for. The Staten Island Children's Museum could be
  answered (Snug Harbor is in Livingston, which IS in the vocabulary), which is the contrast that makes the
  other three genuine escalations rather than laziness.

### Three dated titles, retired

`Bronx House — Summer Fun 2026`, `New York Botanical Garden Science Camp (2026)`, `Staten Island Children's
Museum — Summer Camp 2026`. Each retired as a program card anyway, but a year in a title is its own defect:
the card will still be live next summer.

## v153 (2026-08-09): batches 31–32 — two records that describe nothing, and a self-refutation signal

### Batch 31: the signal queue, 8 records

Two of the eight were not businesses at all, and both were **live**:

- **`prov-manhattan-wikitravel`** — a live Dance / Birthday Parties provider named "Manhattan -
  Wikitravel", sourced to `wikitravel.org/en/Manhattan`. Its short description is a census statistic ("The
  average household had 2.1 people"); its long one continues into a plot summary of a novel set in 1870s
  New York; its `address` is a fragment of a travel-guide sentence, *"145 West 47th Street, you find the
  hotel RIU Plaza Manhattan Times Square"*. It also carried a geo pin marked `precision: "exact"`, so a
  family would have seen a confident Times Square marker for a provider that does not exist. This is the
  reference-host token-match bug — documented on 25 content cards — **reaching `providers`, where the
  record is live and carries copy.**
- **`prov-how-to-improve-your-english-speaking`** — sourced to `learnenglish.britishcouncil.org`, claiming
  an Upper West Side address, `primaryActivityType: "Art"`. Quarantined on two independent grounds: it is a
  page of learning material rather than an organisation, and read generously as the British Council's
  LearnEnglish service it is online-only with no New York premises.

**A negative result, stated as a census.** Scanning ALL live providers for a reference/platform host in
name, website or copy returned **six**, of which one was real. Four of the five false positives were an
operator's own social links inside scraped chrome. The fifth is mine: the pattern `ebay\.` matched
`healthebay.org` — Heal the Bay — with no word boundary. **Third time this session a hand-written regex has
reproduced the exact substring class `scanGuards.matchesWholeWord` exists to prevent** (after `york` in
"New York" and `Art` in "Martial Arts").

Also in the batch: **CityPickle** corrected off a `Times Square, Manhattan, NYC` placeholder onto the real
flagship at 1501 Broadway, with the other three NYC clubs (Long Island City, Wollman Rink, Brooklyn Bridge)
recorded as a split candidate that already meets the distinct-source requirement; **Heal the Bay Aquarium**
moved off Heal the Bay's own office at 1444 9th St onto 1600 Ocean Front Walk under the Santa Monica Pier —
the **sixth** instance of the parent-HQ-address defect and the first on the LA tenant; and **Launch Math**
corrected from a fabricated Upper EAST Side to its one real centre at 173 W 81st, the sibling check coming
back clean, which is what makes it a correction rather than a retirement.

### The new signal: `format_self_contradiction`

`category` and `programType` BOTH hold the format — the taxonomy's own first rule — so a record where they
disagree is refuting itself with no research required. Three records in two consecutive batches carried one
(Asphalt Green: Drop-In Activities vs Camps; World Martial Arts: Birthday Parties vs Classes; KOKO Music:
Camps vs Classes), which prompted measuring it: **57 of 760 live providers**, dominated by `Camps`/`Classes`
(14), `Birthday Parties`/`Classes` (11) and `Camps`/`Birthday Parties` (11). A further 317 have a category
and an empty programType — a gap, not a contradiction, and deliberately a different signal, because
conflating them would bury 57 real self-refutations in 374 rows.

**Deliberately not auto-resolved.** The obvious rule — prefer the year-round format, since a school leading
with "Camps" in October misleads — is right most of the time and wrong for a genuinely summer-only camp.
The signal orders the queue; a human decides which field is the lie.

### Batch 32: the first nine of that cohort, and what the flag was pointing at

Every one carried other defects the contradiction had merely pointed at, which is the argument for the
queue-not-sweep treatment:

- **Writopia Lab Brooklyn contradicted itself on three axes at once** — named Brooklyn, filed under
  Manhattan / Upper West Side, and its own copy said the workshops are in "Brooklyn's northern suburbs",
  which is not a place. Writopia has two real NYC labs, but for a card that *names* Brooklyn there is
  exactly one real answer (391 5th Avenue, Park Slope). The Manhattan lab at 155 W 81st is recorded as an
  uncarded coverage gap.
- **A preschool whose record was named "… Camps"** — Pusteblume, where `category: Camps` disagreed with
  both its own name and its own copy simultaneously.
- **"Central LA" looks like a default on the LA tenant.** Brentwood Art Center at 1625 Olympic Blvd is in
  Santa Monica, a *Westside* neighbourhood in this platform's own vocabulary — the second LA record in two
  batches with exactly that pair of errors, after Heal the Bay. Worth a cohort query.
- **A second `182 Henry St` duplicate**, already sitting in the address-cluster output, resolved here.

### Malformed phone STRINGS: a census, and a real negative result

NYC Elite Gymnastics stored `'(212-334-3628'` — an opening bracket with no closing one. Scanning all 760
live providers for unbalanced brackets, stray characters or too-few digits found **exactly two**, both the
same unbalanced-paren truncation (the other being Planet Han Mandarin's `'646) 928-0086'`, the mirror
image). Both repaired as punctuation, digits kept. This is distinct from the earlier undialable-number
sweep, which found 42 records whose digits were wrong; here the digits are right and the string is broken.

## v154 (2026-08-09): batches 34–35 — a relocation banner, a lifecycle census, and 88 records sharing 24 descriptions

### Batch 34: nine more format contradictions, 9 records

The flag kept pointing at bigger things than itself:

- **Johnny Karate NYC's own homepage opens with "We've moved. Please visit us at our new studio: 164 Union
  St, Brooklyn, NY 11231".** The card stored the placeholder `Downtown Brooklyn, Brooklyn, NYC`; 164 Union
  Street is CARROLL GARDENS. This is a lifecycle state the catalogue had not recorded — **relocated** —
  alongside pre-opening (Goldfish UWS), temporarily closed (two library branches) and permanently closed
  (City Treehouse). It is the one where the card is about a real, open business and is simply sending
  families to the old door, and **no amount of field-against-field checking finds it**: the correction
  exists only on the operator's front page.
- **A sentence fragment stored as an address**, second instance: Brooklyn Bridge Park Conservancy's
  `address` read *"99 Plymouth Street, visitors can drop in to our free Environmental Education Center for
  self"* — a street number followed by the rest of a marketing sentence, cut mid-word. Same shape as the
  quarantined Wikitravel record, but here the street part is right, so it is a truncation to repair.
- **MakerState quarantined for no fixed venue.** Its own navigation is "Teacher Training & Coaching",
  "Start an Afterschool Makerspace", "Resources for Teachers", "NSF Maker Partnership"; its contact is
  `partners@maker-state.com`; its contact page gives no address. It runs STEM programmes inside other
  people's schools. Recorded as real and not a fraud — it would qualify the day it opens a space of its own.
- **Soccer Stars came out the OTHER way on the same question.** It was previously noted alongside Music To
  Your Home as a possible no-fixed-venue case, but its own site names a "Soccer Stars Center" and its NYC
  footer gives 606 Columbus Avenue, matching the record's stored neighbourhood. Real fixed venue plus park
  classes is the hybrid case, not the prohibition. Its two Brooklyn siblings still carry placeholders and
  name no venue — flagged, not inherited.
- **Check for a venue card before retiring a "… Education" record.** Prospect Park Zoo Education was the
  zoo's ONLY card, so it was promoted to the venue rather than retired as a program card.

### Lifecycle language in stored copy: a census, and a near-total negative result

Given the Johnny Karate find, the obvious question is whether operator lifecycle banners survive into
scraped descriptions. Across **all 756 live providers**: **0 closing, 0 farewell, 0 temporarily-closed, 1
relocation**, and 8 "pre-opening" hits of which nearly all are the ordinary word *pre-registration*. So the
answer is no — **a relocation or closure can only be found by fetching the operator's page**, and the
catalogue's existing closure findings (City Treehouse, apple seeds) were luck rather than method. Worth
knowing before anyone plans a copy-based sweep for it.

### The scan that census produced: `sharedDescriptions()`

Two of the eight false positives had **byte-identical descriptions under different names** (Manhattan Track
Club Youth and East Harlem Youth Track), which is `sharedImages` applied to the field a family reads and
had never been measured. Result: **24 texts shared by 88 of 756 live records — 12% of the catalogue.**
`src/scripts/providerSignals.ts`, with a 40-character floor so short fragments do not collide by chance.

It finds three things no per-record check can, because each is only visible with two records side by side:

1. **Duplicates whose names differ** — "Bedstuy Youth Soccer Club" twice, "Brooklyn Rugby" against
   "Brooklyn Youth Rugby", "NYPD Cops and Kids Boxing" against "NYC Cops & Kids Boxing Club". A name scan
   misses these, and an address scan misses them when both addresses are placeholders.
2. **Pipeline-generated filler that reads like prose** — *"Youth soccer classes and leagues in Manhattan."*
   on two records, *"Recurring youth sports programme with multiple sessions available throughout the
   season."* on nine. Not scraped from anywhere; generated.
3. **A whole cluster scraped off a governing body's site** — see below.

Adding the signal immediately flagged **this repo's own test fixture**, where two "clean" records shared
`"x".repeat(200)`. The signal was right; the fixture was fixed and the episode left in a comment.

### Batch 35: the seven-gym USA Boxing Metro cluster — a FIFTH wrong-source shape

Seven independent, real amateur boxing gyms — each with its own real street address across four
neighbourhoods — all carried `usaboxingmetro.com` as their `website` and that site's navigation as their
description: *"Home About Events Registered Clubs Membership Info Registration Forms Rules National Rule
Book U…"*.

Distinguish it from all four already catalogued. Not **off-topic contamination** (every entity is real).
Not a **franchisor root domain** (USA Boxing Metro franchises nothing — the clubs are independent
businesses paying it for sanctioning). Not **domain hijacking**. Not **token collision**. It is a
**sanctioning-body registry**: the pipeline found the clubs on a governing body's "Registered Clubs" list
and recorded the list as each club's own site. The tell is exactly what made it findable — N unrelated real
businesses sharing one domain AND one description, where the domain belongs to an organisation none of them
is.

Handled as real-entity-bad-source. Each keeps its address, gains the neighbourhood its own address
determines (Brighton Beach, Gravesend, East New York; NoHo corrected from Greenwich Village for 636
Broadway at Bleecker), and gets copy stating only what the registry evidences — name, registration,
address — with no invented schedule, price or age band. **The shared website is flagged needs_human rather
than cleared**: an empty `website` is this catalogue's strongest fabrication signal, and these are not
fabrications. One neighbourhood (59 Malcolm X Boulevard, on the Bed-Stuy/Bushwick line) was deliberately
left empty.

## v155 (2026-08-09): batch 36 — six clusters only the shared-description scan could reach

Eleven records, six clusters, and the point of the batch is what found them. Every pair here shares a
description word for word, and **none is reachable by any other scan in this repo**:

- **Three share a name too similar for a name scan to be safe.** "Brooklyn Rugby" against "Brooklyn Youth
  Rugby"; "NYC Cops & Kids Boxing Club" against "NYPD Cops and Kids Boxing"; and "Bedstuy Youth Soccer
  Club" **twice, byte-identical** — the third confirmed instance of that shape after Harlem Jets and
  Brooklyn Lacrosse Club. A name sweep loose enough to catch the first two would be loose enough to merge
  United Soccer Academy with Brooklyn United, which this catalogue has already recorded as dangerous.
- **Two carry placeholder addresses**, so `addressClusters()` is blind to them by construction.

### A new program-card sub-shape: split by AUDIENCE

"JukeBox Kids Boxing" and "JukeBox Teen Boxing" — same phone, same site, same placeholder address, same
description. The catalogued version of the program-card defect splits a venue by which SPORT it teaches
(Textile Arts Center Kids, Brooklyn BJJ Kids, Asphalt Green Basketball Foundations); this splits it by
which CHILDREN it teaches. One gym teaching two age bands is one gym.

### The scan handed over a safety fix nobody had asked for

An earlier batch cleared a phone with a KANSAS area code, (785) 375-3589, from East Harlem Youth Track
because it matched nothing on the operator's site. The shared-description scan then paired that record with
Manhattan Track Club Youth — same website, same word-for-word description — and **that record carries the
identical Kansas number, which nobody checked at the time.** Cleared. This is the "check the whole pattern,
not the instances you noticed" rule catching a miss of my own, and it is the second time in two batches
that a shared-description pair has surfaced a defect that was only half-fixed.

Shared descriptions after this batch: **17 texts / 69 records, down from 24 / 88.** What remains is
dominated by three genuinely large clusters — 33 NYC Parks Summer Sports Experience and Kids in Motion
records, 6 Brooklyn Bridge Park Conservancy records, 3 Steve & Kate's campuses — which are programme
clusters needing the build-then-retire treatment rather than pairwise deduplication.

## v156 (2026-08-09): batches 37–38 — the rented-venue rule applied in BOTH directions

### Batch 37: two clusters at 334 Furman Street, 9 records

**The address-cluster classifier's documented under-count, caught in the wild.** `addressClusters()` put
Brooklyn Bridge Park Conservancy and Brooklyn Lacrosse Club in ONE cluster labelled `one-operator`, because
every name in it begins with "Brooklyn". They are two unrelated organisations sharing a building. This is
exactly why `mixed` versus `one-operator` may order a queue and must never authorise a sweep.

- **Brooklyn Bridge Park, 6 → 1.** All six records carried the park's OPENING-HOURS TABLE as their
  description — *"Pier 2 8AM-11PM* seasonal Pier 5 6AM-11PM Education Center 3-5PM (THU/FRI)…"* — useful
  information in entirely the wrong field, identical six times. Five were programme cards naming a PIER
  rather than an address (a soccer league, basketball and volleyball clinics, two kayaking programmes). A
  pier is part of a park the same way a named school inside one building is a division rather than a
  venue. The Environmental Education Center at 99 Plymouth Street stays separate — it is a distinct building.
- **Brooklyn Lacrosse Club, 3 → 1**, including the **fourth** confirmed pair of live records with a
  byte-identical name (after Harlem Jets and Bedstuy Youth Soccer Club).

### Batch 38: the rented-venue rule cuts both ways in one batch, 12 records

Steve & Kate's and Soccer Stars both run programmes in other people's buildings, and the catalogue's own
rule sends them **opposite** ways:

- **Steve & Kate's: campuses KEPT.** It owns no venue anywhere — renting school buildings for the summer
  *is* the business — so its campuses are its real locations. Five live records collapsed to the two real
  Manhattan campuses (1 West 88th Street, and the Cathedral School at 1047 Amsterdam Avenue).
- **Soccer Stars: rentals RETIRED.** It has a year-round centre at 606 Columbus Avenue, so its summer camps
  inside Tribeca Synagogue and at Socceroof Wall Street are surplus — the same call as The Art Farm's
  `/summer-camp-uws/` card at the Calhoun School. Two further cards ("Super Soccer Stars Park Slope" and
  "…Brooklyn Heights") name no venue at all and join five siblings an earlier pass had already retired for
  exactly that.

**Applying one rule to both without noticing which side each falls on would have deleted a real camp
operator or kept four cards for one soccer school.** The test is not who owns the building; it is whether
the operator has anywhere else to be.

Two other findings:

- **A new ID-truncation shape: the ampersand.** `prov-kate` is what the slug generator produced from
  "Steve & Kate's Camp" — everything before the `&` was lost. The id cannot be rewritten through this
  bridge, so the record was retired in favour of its twin at the same address, after moving its better
  name across first.
- **Another garbage title on a live record: "Brooklyn City ."** — the club's name truncated mid-word with
  the stray full stop from "F.C." left behind. Same family as the "New" / "And" / "Crossbar (new)" titles.
  Its sibling's address field held four public pitches in one string, which was **cleared**: a league on
  public fields is not caught by the no-fixed-venue prohibition (Brooklyn AYSO and Gjøa were both kept on
  that ground), but those two each had ONE identified home ground and this has four, so an empty field is
  the honest one and the four grounds are recorded as a split candidate.

Shared descriptions after these two batches: **12 texts / 51 records, from 24 / 88.** What is left is
dominated by the 33-record NYC Parks Summer Sports Experience and Kids in Motion cluster.

## v157 (2026-08-09): batches 39–41 — the 33-record NYC Parks cluster, resolved by VENUE not swept

33 live records named NYC Parks programmes: `Summer Sports Experience: <sport> at <park>`, `Kids in Motion
at <park>`, and one Basketball Clinic. Grouping them by the venue in their own titles gave **26 distinct
parks, of which 21 had exactly one record and were already correct.** That is the one-card-per-location
rule working at scale on a municipal operator — the same conclusion an earlier pass reached about
laparks.org's 30 cards, and the reason cluster size alone is never evidence. **Retiring on size would have
deleted 21 real, distinct, correctly-carded public parks.**

### Batch 39 — five parks with more than one record (12 → 5)

Highbridge Recreation Center (3), John J. Carty Park (3), Holcombe Rucker Park (2), St. John's (2),
Brownsville (2). Two of those five were not obviously duplicates at all: **St. John's Recreation Center
stands at 1251 Prospect Place inside St. John's Park**, and **Brownsville Recreation Center shares 1555
Linden Boulevard with Brownsville Playground** — each read as two venues only because one card used the
park's name and the other the building's. In every case the survivor was chosen by which record had a real
street address; where neither did (Rucker Park), the tie-break was which card describes what the place
actually is.

### Batch 40 — the twelve Kids in Motion playgrounds, given their own copy

Two defects were uniform and needed no research: **`primaryActivityType: "Fitness"` on a free drop-in
supervised PLAY programme**, and `category: "Classes"` on a programme whose entire model is turning up
without booking. Both fixed to Drop-In Activities across all twelve, and each park given copy of its own.
One empty address filled (Lawrence Virgilio Playground, Woodside).

### Batch 41 — the nine Summer Sports Experience records, and a miss worth recording

**Batch 39's venue grouping missed a sixth duplicate, and both scans were structurally blind to it.**
"Summer Sports Experience: Various Sports at Fort Hamilton Senior Recreation Center" is at 9941 Fort
Hamilton Parkway — the same address as John J. Carty Park, because the senior centre stands inside that
park. Grouping by the NAME in the title puts them in different buckets; grouping by ADDRESS cannot help
because these records store the venue's own name in the address field. Only reading the nine found it.
Worth stating as a limit rather than a one-off: **when a cluster's addresses are placeholders, the address
scan is blind by construction and the name scan is all that is left — and a name scan cannot know that one
building sits inside another.**

Three defects across the nine: the venue's own NAME stored as the address (and on two records, the CARD'S
OWN TITLE stored as the address, the same shape found on a Steve & Kate's record); `Fitness` or the bare
parent `Sports` with no discipline; and three empty neighbourhoods. Four addresses were filled from the
parks themselves, two neighbourhoods refined from the Harlem display group to Central Harlem, and **two
were deliberately left empty** — Ben Abrams Playground, whose location could not be confirmed, and
Scarangella Park, which sits between two adjacent vocabulary entries with nothing on the record to settle it.

**Shared descriptions across the live pool: 9 texts / 18 records, from 24 / 88 when the scan was written.**

## v158 (2026-08-09): batches 42–44 — the shared-description cohort closed, 88 records → 0

`sharedDescriptions()` was written three batches ago and reported **24 texts shared by 88 of 756 live
providers**. It is now **zero**, across 716 live providers. What it found on the way down is more
interesting than the count.

### A limit of the scan, worth stating alongside the others

**A shared description groups the records that share ONE scrape, not all the records for one operator.**
The scan reported Asphalt Green as a PAIR; the operator had four live records covering two real centres.
It reported 78 Youth Sports as a pair; there were four. It never paired Church Street Boxing's two
locations at all, because only one of them carried the text that formed the pair. Every cluster scan in
this repo returns a slice — the slice is a lead, and the operator is the unit.

### The operator's own PAGE TITLE gave an address two cards had wrong

`nycsocceracademy.com`'s title tag reads *"NYC Soccer Academy | soccer camp | Columbia University Baker
Athletics Complex, West 218th Street, New York, NY, USA"*. Both of its cards stored **145 East 14th
Street**, five miles south. Corrected to the Baker Athletics Complex in Inwood. Note the symmetry: a title
tag has produced garbage business names repeatedly this session — "Crossbar (new)", "Kids Multi" — and here
the same field is the most reliable evidence on the page.

Its twin was named **"Manhattan Soccer Academy"**, and that is the already-catalogued danger: Manhattan
Soccer Club is a real, separate, long-established New York youth club, so leaving that card live would
quietly hand families searching for one club a different one.

### Two records at 220 East 11th Street, neither operator there

Downtown United Soccer Club is carded correctly at Pier 40; this second card placed it at 220 East 11th
Street with `nyc.gov/parks/programs/recreation/youth-sports` as its website. Its address-sharing twin,
NYCFC Academy Youth, describes an academy that actually trains at the Etihad City Football Academy in
**Rockland County** — the third out-of-taxonomy record found today, after 92NY's Camp Yomi and the YMCA of
Metropolitan Los Angeles's Mammoth Lakes camp.

### A needs_human from batch 26, settled — in the opposite direction

Batch 26 found Sunset Park Youth Baseball sourced to `harlemlittleleague.org` and deliberately did **not**
tidy it, on the ground that improving a field on a record whose reality is unestablished makes a doubtful
record look more credible. The shared-description scan settled it the other way: the identical text sits on
Harlem Little League's own correct card, and the two are five miles and two boroughs apart, so the source
is **provably** not this entity's — a fact about the pipeline, not a doubt about the business. Sunset Park
Youth Baseball is real at 420 45th Street; its website was **cleared** rather than kept, because pointing a
family at another borough's league is worse than pointing them nowhere.

### And several pairs that were not duplicates at all

FDNY Bravest Boxing (9 Duane Street) and Church Street Boxing (52 Walker Street) shared only a *generated*
sentence about USA Boxing Metro registration. Church Street's own two records — 52 Walker Street and 25
Park Place, different phone lines — are two real gyms, correctly carded one each. **Finding two records for
one brand is not by itself a duplicate finding**, which is the counterweight to everything else in these
three batches.

Also closed: The Painted Pot's two studios both given their real addresses (188 5th Avenue and 339 Smith
Street) — the Carroll Gardens card had been storing *Park Slope* as its address, the other studio's
neighbourhood, on the wrong card.

## v159 (2026-08-09): batches 45–47 — a directory, a location slug for a name, and a placeholder on a real domain

### Three records that were not businesses

- **`prov-new-york-ny`** — a live provider literally named "New York, Ny", which is the location label from
  the URL it was scraped from (`ny-new-york.childrensartclasses.com`, a per-territory franchise site). Its
  address was a placeholder, its phone a NASSAU COUNTY (516) number, its email a named franchisee's. A
  franchise TERRITORY is not an address — the same ruling that kept Brooklyn Robot Foundry's surplus cards
  off "NY – Manhattan East".
- **`prov-tidybash-party-directory-nyc`** — a party DIRECTORY's own browse page. Its name says so, its URL
  is `/directory`, and its long description is a jumble of other businesses' offerings. Same ruling as
  letsgobaby.co and ActivityHero's browse pages.
- **`prov-goldfish-swim-school-manhattan`** — a chain-level card for a borough, on a brand whose Manhattan
  situation this catalogue had already worked out: the only open NYC school is in Gowanus, and the UWS
  Broadway school is in pre-registration and was deliberately not carded. Retired rather than corrected,
  because correcting it either way would card a pre-opening pool or duplicate an existing card.

### Two limits of the shared-description scan, both confirmed in the wild

A **seventh** Brooklyn Bridge Park programme card turned up that the six-card cluster did not contain,
because its copy differs. **Closing a shared-description cluster closes a scrape, not an operator.** And
the third **sentence fragment stored as an address** appeared (BAX: *"421 5th Avenue, Park Slope This
building is located roughly"*), after the Wikitravel and Brooklyn Bridge Park instances — three makes it a
pattern: the extractor takes the run-on text after an address rather than stopping at it.

### The email scan, reported as three censuses

Prompted by batch 46's `play@info.com`. Across all 712 live providers, 392 with an email:

| Check | Result |
| --- | --- |
| Placeholder or malformed by domain denylist | **ZERO** — the one hit was a false positive of my own check (`mail@` is an ordinary real prefix) |
| Free-mail (gmail/aol/hotmail) as a business contact | **54**, and **not a defect** — these are volunteer-run neighbourhood clubs. Recorded so nobody sweeps them |
| Email domain unrelated to website domain | **42**, of which ~35 are benign (subdomains, parent orgs, partners) and **7 are real** |

A ~17% hit rate, against the 90%-false-positive rate of the domain-token detector this loop abandoned
earlier. One of the seven was deliberately written up as a NON-defect (Fordham's reading programme is
delivered with an outside partner whose address is the published contact) — **an email domain differing
from a website domain is a question, not a finding.**

**The sharpest find would have been missed by any denylist: `filler@godaddy.com`.** The word FILLER, on a
real, well-known domain. A generic-domain denylist looks for `example.com`; a placeholder can sit on a
domain that is entirely real, and the tell is the LOCAL PART. It also appears inside that record's own
scraped description — *"Signed in as: filler@godaddy.com"* — meaning the scraper captured a LOGGED-IN
SESSION belonging to whoever built the site rather than the public page.

The others: another company's email and phone on a card (`info@soccerstars.com` on Amazing Athletes); a
`.co.za` South African address on an NYC party company; **PLAYDAY's Upper West Side card carrying the Long
Island City studio's email and a Park Slope address — three of the brand's four studios on one card**,
which is exactly the confusion that produced the fabricated "PLAYDAY NYC Tribeca" card an earlier pass
quarantined; a real dojo whose `website` was a third-party directory listing while its `email` was the
operator's own (the email was the field telling the truth); and a booking platform's inbox standing as an
operator's.

## v160 (2026-08-09): batches 48–49 — both cohorts closed to zero, and two mistakes of my own

**`format_self_contradiction`: 57 → 0. Shared descriptions: 88 records → 0.** Both cohorts, opened earlier
today, are now empty across 711 live providers.

### A card can assemble one field from each of an operator's locations — twice, in two batches

Kinder Prep Montessori's card is NAMED Brooklyn Heights, filed under Brooklyn Heights, ADDRESSED to DUMBO,
and emailed at `williamsburg@`. Three of the operator's five Brooklyn locations, one per field. The
previous batch found the identical shape on PLAYDAY's Upper West Side card (LIC email, Park Slope address).
Two unrelated operators in two consecutive batches makes it a pipeline shape worth naming: **when an
operator has several locations, a card can end up taking one field from each**, and every field will look
individually plausible.

Modern Martial Arts Tribeca was the mild version — name, neighbourhood and email all saying Tribeca against
an address saying Upper West Side. Three fields agreeing against one is the easiest form to resolve.

### Two mistakes of my own, both worth more than the fixes

**A reason is not a write.** Batch 33's write on Descanso Gardens said, in its recorded reason, *"category
Drop-In Activities against programType Camps; both now Drop-In Activities"* — and set neither field. The
prose asserted a change the payload did not contain, and it read as done. This is the same failure the
owner caught earlier today when SOP v147 claimed a compound value was "rejected on write" while the guard
did not yet cover it. **The batch driver's read-back verifies only the fields that were actually sent, so
it is structurally unable to catch a field that was described and omitted.** Re-running the cohort query is
what caught it — an argument for measuring a cohort to zero rather than trusting a batch report.

**A derivation that filters an unknown value makes an invalid write look successful.** Batch 48 set Kinder
Prep's `primaryActivityType` to `"Preschool"`, which is not in the activity vocabulary. The write
succeeded, `alignActivityTypes` correctly discarded the unrecognised value, and the record was left with NO
primary activity and an EMPTY tag list — **worse than the wrong "Gymnastics" it started with.** The only
signal was a DIFF in the read-back on those two fields. Before writing an activity value, check it against
the vocabulary actually in use.

### Also closed

Little Flower Yoga quarantined for no fixed venue — its own navigation is "Why / Training / Schools /
Books / About", its headline offering is *"Certification for Educators and Clinicians"*, and it publishes
neither an address nor a class a parent could book, which is why the record's address and neighbourhood
were both entirely empty rather than placeholders. Same ground as MakerState. Soccer Kids NYC came out the
other way on the same question and was kept with a needs_human, because its site is entirely family-facing
with real enrollable programmes — the difference is who the operator is talking to.

Broadway Dance Center's children's card carried **an adults-only course listing as its description**
("Ages 18+ • Oct 5, 2026-May 14, 2027"), on the record for the Children & Teens division.

## v161 (2026-08-09): batch 50 — "Mail Online", and why the denylist built for it missed it

`prov-mail-online` was a **live Brooklyn provider** named Mail Online, sourced to `dailymail.co.uk`,
addressed to *"9 Derry Street, London W"* — the Daily Mail's London office, cut off mid-postcode — with
2,389 characters of British tabloid front page as its long description, opening on a Michael Gove column
and running into Zendaya and Tom Holland having lunch. Filed under Birthday Parties and Sports, ages 0-2
and Teens. Quarantined. Second such record found today, after "Manhattan - Wikitravel".

**How it was found is the finding.** Not by the reference-host scan built for exactly this defect — that
returned six hits with five false positives and did not include this one, because `dailymail.co.uk` was not
on its list. **A denylist finds what is on the list.** It was found by the defect-signal queue, because a
fabricated record is also an incomplete one: no phone, no email, no neighbourhood, a 74-character
description.

### The positive form of the same check, which needs no list

Rather than enumerating bad hosts, ask whether the stored address contains ANY marker placing it in the
record's own tenant service area. `addressIsInServiceArea()` in `locationEvidence.ts`. Across **690 live
providers with an address: 26 fail, and none is out of area** — three are citywide-programme records
already recorded as split candidates ("94 NYCHA community centres citywide"), and the other 23 are bare
street lines with no city or ZIP suffix ("253 36th Street", "50 Bedford Ave."), incomplete rather than
wrong. A clean census-scale negative result, and one that can now be re-run in a second.

**Its limit is asserted in a test rather than glossed**: the YMCA of Metropolitan Los Angeles's Mammoth
Lakes camp address, 300 miles from the city, PASSES — Mammoth Lakes is in California. That record was found
by reading it, and the check is not stronger than it is.

### Two clubs a name scan would have merged

Lil' Kickers Manhattan (`lilkickers.com`, a national franchise) and Manhattan Kickers Soccer Club
(`manhattankickers.org`, a local club) differ only by word order. Both kept. An earlier pass had already
recorded "Lil' Kickers Manhattan on manhattankickers.org" as a cross-wiring risk, so this is the same pair
seen from the other side — and it is the fourth confirmed instance of two real organisations with
confusingly similar names, after United Soccer Academy / Brooklyn United, the two fencing clubs, and the
two Williamsburg soccer clubs.

## v162 (2026-08-09): the taxonomy gap closed, and the listings it had deleted brought back

Three owner directives, all implemented. See CLAUDE.md's new "Out-of-city, out-of-borough but REAL
listings get built, not deleted" and "Per-field provenance" sections for the binding rules; this records
what changed in the data.

### Batch 51 — 8 records, including two camps back from the dead

| Record | Was | Now |
| --- | --- | --- |
| **92NY Camp Yomi** | HIDDEN — retired for having a Rockland County address | `hudson-valley` / Rockland County / **Orangeburg**, address moved off 92NY's Manhattan building |
| **Camp Yomawha** | QUARANTINED — same reason | `hudson-valley` / Rockland County / **Pearl River**, read off the address the record already had |
| TGA of Northern Nassau County | LIVE, filed under Queens / Bellerose | `long-island` / **Nassau County**, town cleared (a territory is not a place) |
| Commonpoint "Long Island / Queens" | compound name, wrong neighbourhood | Sam Field Center, **Little Neck**, Queens — its own ZIP settled it |
| Lula Washington Dance Theatre | Central LA, empty neighbourhood | **South LA / Crenshaw** |
| Descanso Gardens | neighbourhood deliberately empty | **La Cañada Flintridge** |
| Broadway Gymnastics School | neighbourhood deliberately empty | **Del Rey** |
| PLAYDAY Upper West Side | borough still said Brooklyn | Manhattan |

**Two of those were honest empties that became honest values.** Batch 33 left Descanso Gardens and
Broadway Gymnastics with no neighbourhood, recording explicitly that the vocabulary lacked La Cañada
Flintridge and Del Rey and that rounding to a neighbour would be a precise wrong answer. That is exactly
the sequence the directive was meant to enable: refuse to guess, record why, and fill it when the gap
closes.

### The reinstatement path, and why it is safe

`visibility` and `qualityStatus` remain defensive-only through this bridge. The single exception is that a
record may be un-hidden **only in the same write that places it in an expansion-market district that
resolves** — which means it can reverse the taxonomy defect and nothing else, because a record quarantined
for being off-topic, fabricated, adults-only, closed or without a fixed venue has no out-of-borough
district to offer. Tests assert both directions, including that a market KEY ("long-island") is not
accepted where a county is required.

### `fieldVerifications` used in anger for the first time

Batch 51 is the first to carry it. Camp Yomi now records four entries — three `corrected`, and
`phone: confirmed` against 92NY's own published number. **That last one is the case the field exists for:**
the phone was already right, checking it changed no bytes, and before today that work left no trace at all.

TGA carries `neighborhood: needs_human` with the reason recorded on the field itself rather than buried in
an audit-log reason nobody reads — a franchise territory is not a place, and the next pass can now see that
the question was asked and deliberately left open.

### A failure of mine, three instances, now named

PLAYDAY's borough was left saying Brooklyn while batch 47 corrected its neighbourhood and address to the
Upper West Side. Batch 33 recorded a reason claiming a `programType` fix its payload never sent. Batch 48
wrote an activity value not in the vocabulary and the derivation silently discarded it. All three share a
shape: **the batch driver's read-back verifies only the fields that were SENT**, so it cannot see a field
that was described and omitted, nor one whose absence is the defect. When correcting a place, write every
level of it.

### Batch 53 — the vocabulary-coverage sweep, and the one record it found

The directive's verification is not "the code compiles" but "does every live listing's stored place now
resolve against some vocabulary?" A temporary in-repo vitest file (written inside `src/` so the `@/` alias
resolved — `npx tsx` cannot load this repo's tsconfig from the scratchpad) walked all **712 live
providers** and resolved each stored `borough`/`neighborhood` against NYC, LA and the four expansion
markets:

```
live providers: 712
BOROUGH unresolvable: 0
NEIGHBOURHOOD unresolvable: 1
    prov-brooklyn-elite-volleyball   Brooklyn -> "Columbia Street Waterfront District"
```

That single record was a **spelling variant, not a missing place** — the canonical name is "Columbia
Street Waterfront", and adding the long form as a synonym would require a fold target for a name that is
already its own display group. Corrected to the canonical spelling, with `neighborhood: corrected` recorded
in `fieldVerifications`. Coverage is now complete.

**Why the sweep was worth running separately from the batches that motivated it.** Every place fix this
session was found by working a record; this asked the inverse question — *is there anything left the
vocabulary cannot express?* — and could only be answered by enumerating the pool. A vocabulary change that
is verified only by the records that prompted it is verified against its own training set. Recording a
census result (712, not a sample) is the other half of the already-catalogued rule about saying sample-vs-
census out loud.

## v163 (2026-08-09): sport coverage by scarcity — the plan, and round 1

Owner directive: *"I need to find more sport related listings for Brooklyn and Manhattan… based on
scarcity. Where the less available sport camps and classes are… 10 in a round, then find the next most
under-represented neighbourhood and do it again."*

### What had to be built first, and one fact that changed the whole approach

**`publishedAt` is NOT the public gate.** It is a sort key (`{publishedAt: -1, id: 1}`), defaulted to the
epoch when absent. The stats page reports a "published" count from it and that number — 227 — is not the
number of listings a family can see. The real gate is `isPublicProvider` in the main app's
`publicBrowse.ts`: an **imgbb-hosted image**, a name, a category, a location, a usable source URL, not
hidden, not quarantined, and no scraped chrome in the copy. By that test **all 712 live listings are
visible**, and the scarcity counts below are real.

Three capabilities were added because the work is impossible without them:

- **`publishGate.ts`** — a faithful port of `isPublicProvider`. `visibility`/`qualityStatus` on
  `providers` are no longer strictly one-directional: a write may reveal a record **only when the record,
  as it will be after that write, passes the gate in full**, adjudicated in `applyCardBridgeWrite` against
  the merged document. The old rail said revealing is "the main app's own gate to open and this bridge
  does not replicate it" — right about the risk, wrong about the conclusion. `meetupGroups` is untouched;
  its gate has not been ported.
- **`POST /api/card-bridge/create`** — one new `providers` listing. Splitting needed a parent, so a
  genuinely new business had no way in. Image is **mandatory**, per the owner: *"the image is always
  required and always has to be checked and added to the database."* Three collisions are refused before
  insert: `id`, normalised **street address**, and **image reuse**.
- **`POST /api/card-bridge/image`** — re-hosts a venue's own photograph on imgbb, the only host the main
  app renders. It re-hosts; it never generates or substitutes.

### The scarcity ranking, measured by DISPLAY GROUP

Ranking raw neighbourhoods is misleading: Manhattanville, Sugar Hill and West Harlem all read zero and
all fold into **Harlem**, which has 34. Against the 38 Manhattan and 54 Brooklyn groups a family can
actually browse: **20 Manhattan groups and 18 Brooklyn groups show zero sport listings.**

### The finding that outranks creating anything

**70 live Manhattan and Brooklyn sport listings have an EMPTY `neighborhood`, and 50 of them already
carry a full street address.** They are published, visible, and unreachable by any neighbourhood browse —
and they sit exactly in the scarce neighbourhoods (CityParks Junior Golf at 8850 14th Ave is Dyker
Heights; The Little Gym at 8681 18th Ave is Bensonhurst; Lenny Krayzelburg at 3300 Coney Island Ave is
Sheepshead Bay). Kings Bay Y is the worked example: a live, published swim school at 3495 Nostrand Avenue
with no neighbourhood, which is the entire reason **Sheepshead Bay read zero**. This cohort is the
cheapest coverage in the catalogue — no question of whether the business is real, only where it is.

### Round 1

| Neighbourhood | Sport before | Listing | Outcome |
| --- | --- | --- | --- |
| Canarsie | 0 | Hebrew Educational Society, 9502 Seaview Ave | **created, visible** |
| Windsor Terrace | 0 | Windsor Terrace Martial Arts, 1256 Prospect Ave | **created, visible** |
| Borough Park | 0 | Champions Martial Arts, 4103 Fort Hamilton Pkwy | **created, visible** |
| Sheepshead Bay | 0 | Kings Bay Y | neighbourhood filled — already live |
| Crown Heights | 5 | World Martial Arts Center ×2 | duplicate retired; canonical confirmed |

**Both new guards earned their place on first use.** The address guard refused the World Martial Arts
Center create and turned up TWO existing records for 1120 Washington Avenue, one carrying the site's
navigation menu as both descriptions. The image guard is why only ONE Champions dojo was created: the
operator serves a single brand photograph across every location page, and its Dyker Heights and Mill
Basin dojos — both in zero-coverage neighbourhoods — are deferred until location-specific photographs
exist rather than given a picture of somewhere else.

### Lessons from round 1

- **A guessed URL slug's 404 is not evidence a location closed.** `/fort-lee-racquet-club/` and
  `/water-mill/` both 404; the real paths are `/fort-lee/` and `/watermill/`, and both venues are
  operating. Take slugs from the site's own navigation.
- **A bot-challenge interstitial is defeated by a browser User-Agent.** "One moment, please… your request
  is being verified" is not a dead site. Same class as the TLS-issuer check.
- **`WebFetch` and `curl` have different egress allowlists in this environment** — three operator sites
  blocked for one worked fine for the other. Try both before recording a site as unreachable.
- **The scarcity target is exactly when the precision-in-a-wrong-claim rule bites hardest.** A directory
  put World Martial Arts Center in Prospect Lefferts Gardens, which has zero listings and would have been
  a convenient answer. The operator's own page names no neighbourhood and the address sits on the
  boundary at Empire Boulevard, so the stored Crown Heights was left alone and escalated.
- **A search summary put "Red Hook Martial Arts" in Red Hook — Dutchess County, ZIP 12571**, 90 miles from
  Brooklyn. Token collision on a neighbourhood name, and the same shape as `camp.com` and `zing.cz`.

### Round 1c — the first reveals through the ported gate

The four Tennis Innovators courts created by the provider split arrived hidden, which is that path's
forced default and correct: a raw insert bypasses the main app's publish gate, so a split child can never
be born public. With the gate now implemented rather than avoided, each was given an image and revealed
**by passing it** — image on imgbb, name, category, borough, source URL, no scraped chrome. Seven
listings are now publicly visible that were not this morning: three new Brooklyn businesses in
zero-coverage neighbourhoods, and four Manhattan/Suffolk tennis courts belonging to an operator that had
**no live listing at all** despite five confirmed venues.

On their photographs: Tennis Innovators publishes four images of its own courts and serves the same four
on every location page, so each court was given a *different* one of the four and the fact that it is the
operator's programme generally rather than that specific court is recorded on the record, not glossed.

## v164 (2026-08-09): the target is 10 NEW per neighbourhood, on top of what exists

Owner correction, emphatic: *"You have to deliver NEW 10 listings to every neighbourhood top on the
existing!!!!"* Not "bring each neighbourhood to 10" — **add 10 to each**, including the nine that already
clear it. Across the 92 browsable display groups in Manhattan and Brooklyn that is **920 new listings**,
not the 698 a bring-to-10 reading gives. Chelsea goes 15 → 25; Park Slope 22 → 32.

**Round 1 was the wrong shape and is recorded as such**: it produced one listing each in three
neighbourhoods. A round is 10 in ONE neighbourhood, then the next-scarcest.

### What actually limits throughput, measured rather than guessed

Not tooling. Three things, in order of severity:

1. **The catalogue's coverage gap mirrors the discovery pipeline's gap.** Mining the unpublished pool by
   neighbourhood was the obvious first move and it does not work where it is most needed: Borough Park has
   **1** content card, Canarsie **0**, Dyker Heights **0**, Turtle Bay **0**. These neighbourhoods are
   scarce because they were never crawled, so there is nothing to promote.
2. **Bulk directory sources are closed.** `yelp.com` returns 403 to this environment; NYC Open Data's
   dataset API returns 403 on the resource endpoints while its catalogue endpoint works, and the one
   promising dataset (`ebkm-iyma`, DYCD Program Sites) is overwhelmingly jobs/housing programmes run
   inside school buildings — the rented-venue case, not venues of their own. Sourcing is therefore
   per-venue web research plus verification against the operator's own site.
3. **The image requirement is the binding constraint per listing.** Most small operators publish one to
   three usable photographs. This is what makes it one listing per distinct venue photograph that exists
   on the open web, and it is why only ONE Champions dojo was created in round 1.

### The image guard, narrowed the same day it was written

The original rule refused any image already used by a live listing. Its actual target is 63 live records
sharing 16 files, one banner — `csny-banner-sports.png` — across **fourteen unrelated businesses**. Two
BRANCHES OF ONE OPERATOR sharing that operator's own photograph is not that harm.

T. Kang Taekwondo forced the issue: four dojos (Tribeca, Marine Park, Canarsie, Sheepshead Bay), each with
its own address, phone, email and opening hours on the operator's own site, and exactly one usable class
photograph. Under a flat rule three real dojos in under-served neighbourhoods stay invisible over a
picture. **The test is now host identity, not image identity** — two different operators still cannot
share an image, and the fact that the photo is of the programme rather than that specific room is written
onto each record rather than glossed.

### Live as of this entry — 11 new publicly visible listings

Canarsie ×2 (Hebrew Educational Society, T. Kang), Sheepshead Bay (T. Kang), Marine Park (T. Kang),
Windsor Terrace (Windsor Terrace Martial Arts), Borough Park (Champions Martial Arts), Tribeca (T. Kang),
Hell's Kitchen / Upper West Side / Upper East Side / Water Mill (the four Tennis Innovators courts).

### Image made optional (owner directive, same day)

*"Image is optional not requirement. The better the existing."* Applied to `POST /create`: still validated
when supplied, omitted freely otherwise. **The consequence is recorded rather than glossed** — all three
of the main app's read paths require an imgbb-hosted image (`deriveServingDoc` computes its `renderable`
flag from `isRenderableListing`; `publicListReads` and `publicBrowse` both filter on it, verified by
reading that repo). So an image-less listing is created complete and HIDDEN until a photograph lands, and
the publish gate reports exactly that as the one unmet requirement. Boro Park YM-YWHA is the first.

Making it optional is still right: the research is the expensive half, and a listing with a real address
and phone waiting on a photo beats no record of the business at all.

### Two token collisions caught this round, both by checking the address

`bpaasports.org` — "Brooklyn Park Athletic Association", youth soccer, looks perfect for Brooklyn. Its
address is **15802 Wayzata Boulevard, Brooklyn Park, MINNESOTA**. Likewise a search surfaced "Red Hook
Martial Arts" for Brooklyn's Red Hook; it is in Red Hook, **Dutchess County, ZIP 12571**, 90 miles north.
Both are the `camp.com` / `zing.cz` shape with a PLACE name instead of a business name, and the address
is what catches them every time.

## v165 (2026-08-09): camps are the scarcer half, and a status report after every batch

Owner: *"Do you focus on Camps as well?"* — no, and the brief said "sport camps and classes". All twelve
creates went in as `Classes`, making the imbalance slightly worse.

| | sport **Camps** | sport **Classes** | neighbourhoods with ZERO sport camps |
| --- | --- | --- | --- |
| Brooklyn | 34 | 96 | **37 of 54** |
| Manhattan | 40 | 102 | **26 of 38** |

**63 of the 92 browsable neighbourhoods show a family no sport camp at all.** Camps are the scarcer half
by a wide margin and future rounds are weighted toward them, roughly 6:4.

### One venue, both formats — the main app already solved this

A venue that runs a camp alongside year-round classes must NOT become two listings; one card per physical
location, and the address guard would refuse the second anyway. But `category` is single-valued, so on its
face such a venue is findable under one format only. It isn't: `providerServesCategory` matches on
`category` **or** any entry in `offerings[]`, and `inferOfferingCategories` derives those from the
listing's own text on `\bcamps?\b|day camp|summer camp|break camp|holiday camp`. **Naming the camp in the
description is what makes the venue findable under Camps**, with no duplicate. `offerings` is not writable
through this bridge — added to the core recommendations rather than worked around.

### The backfill found almost nothing, and that is the useful part

Checking each of the twelve against its own site for camp evidence: T. Kang (all four dojos), Windsor
Terrace Martial Arts and Champions Borough Park mention **no camp anywhere**. Only the Hebrew Educational
Society and two of the four Tennis Innovators courts run one, and all three already name it in their copy.
So there was nothing to backfill — **the camp gap cannot be closed by relabelling venues that teach
classes.** It needs dedicated camp operators sourced as their own listings, which is what the next rounds
do. Adding camp language to the other nine would have been fabrication in the copy field.

### The status report, and the flaw it shipped with

`status.py` reports the sum of sport listings in Brooklyn and Manhattan after every batch. Its first run
reported "0 held back for no image" while Boro Park YM-YWHA sat hidden for exactly that reason — hidden
records were excluded from the pool, so **the report was hiding the thing it was built to surface**. A
listing hidden only for want of a photograph is now counted and reported separately from both the visible
total and the quarantined, which are different questions.

## v166 (2026-08-09): round 3 — the empty-neighbourhood cohort, resolved from each record's own address

40 records worked: **29 assigned a real neighbourhood, 11 deliberately left empty.** The cohort of live
Manhattan/Brooklyn sport listings with no neighbourhood went **61 → 32**, and Brooklyn's count of
neighbourhoods showing a family nothing went **16 → 14** — Red Hook (Brooklyn Sluggers Academy, 80A Verona
St) and Dyker Heights (CityParks Junior Golf Center, 8850 14th Ave) both came off zero without a single
new business being researched.

**The total did not move, and that is the correct result.** These listings were always counted; they were
never *findable*. Coverage and count are different questions and the status report now says so.

### What earned an escalation rather than a guess

Eleven, and the reasons cluster into four shapes worth reusing:

- **The record contradicts itself** — Ardon Sweet Science stores "143 30th Street" (Greenwood Heights
  territory) with ZIP 11230 (Midwood, miles away). One is wrong and nothing in the record says which.
- **A suite number is an office, not a venue** — Apex for Youth (195 Chrystie St #200) and Mo'Motion (2214
  Frederick Douglass Blvd, Ste 313). Writing the neighbourhood sends a family to a door they cannot use.
- **A three-way boundary** — 9201 and 9216 7th Ave sit where Bay Ridge, Fort Hamilton and Dyker Heights
  meet, and the vocabulary carries all three separately.
- **A park with no fold target** — Riverside Park between W96 and W110, and Randall's Island, which is not
  in the Manhattan vocabulary at all.

Every one of those would have been easy to fill, and each would have moved the coverage number. That is
exactly why they were not: the sweep meant to increase precision is the worst place to fake it.

### The truncated-id trap, hit again

The batch was first written keying on ids guessed from provider names. **All 36 failed** — real ids carry
an eight-hex suffix (`prov-iconic-cheer-elite-d3ead0cd`). Already recorded in CLAUDE.md and hit anyway;
the fix is to map name → stored id from a fetched list rather than construct the slug, and to assert every
id resolves BEFORE the dry-run rather than reading failures out of it.

## v167 (2026-08-09): round 4 — the empty-neighbourhood listings that needed a fetch

Round 3 took the ones whose own address answered the question. These four needed the operator's site, and
three turned out not to be a missing field at all.

- **Row New York ×2 — a duplicate that became a new location.** Both records pointed at the same Peter Jay
  Sharp Dock on the Harlem River. Retiring the surplus was the obvious move; the operator's own contact
  page lists a second NYC boathouse with no listing anywhere — the **Paerdegat Basin Dock, 1310 Paerdegat
  Ave North, Canarsie**. So the surplus was REPURPOSED onto a real uncarded venue instead of deleted, and
  the survivor got Inwood plus the phone and email it lacked. Its Queens boathouse is recorded for a later
  pass. The same page's office address (110 W 40th St Suite 602) was deliberately not used.
- **JukeBox — 'Brooklyn, NY' is a borough, not a place.** The operator's own site gave 491 5th Avenue,
  ZIP 11215, Park Slope, and a phone the record did not carry.
- **Bent on Learning — a missing VENUE, not a missing neighbourhood.** Its own page title is "Yoga &
  Mindfulness in Schools": it sends teachers into public schools and runs no place a child attends. That
  is the no-fixed-venue prohibition, and it is *why* the field was empty — the pipeline had nothing to
  read. Retired to hidden, not quarantined; the organisation is real, it simply is not a place.

**Worth generalising: an empty `neighborhood` is not always a gap to fill.** Three of four here were a
duplicate, a borough-in-an-address-field, and an operator with no venue. Treat the empty field as a
SYMPTOM and ask what produced it before reaching for a value.

## v168 (2026-08-09): round 5 — NYC Parks recreation centres, and the guard earning its keep again

Venue-by-venue web sourcing hit three walls at once: discovery never crawled the scarce neighbourhoods,
Yelp returns 403 and the parenting camp directories sit behind a WAF, and small operators are hard to
enumerate. **NYC Parks is none of those** — reachable, one detail page per centre with a street address,
cross streets and a direct phone line, and each is a genuine physical place children swim and play sport
in rather than a programme borrowing a room. Twelve Manhattan and seven Brooklyn centres exist.

**11 created**, including **Asser Levy at 392 Asser Levy Place, which is Kips Bay — a neighbourhood that
showed a family nothing.** Four deliberately not created: Herbert Von King is a CULTURAL ARTS centre and
would inflate a sport count with something that is not sport; Pelham Fritz, Shirley Chisholm and Sunset
Park publish no street address this fetch could read and are recorded for when one is confirmed.

All 11 are hidden — NYC Parks publishes no venue photograph, so under image-optional they are complete and
invisible. **That is stated as a limitation, not counted as coverage**: eleven hidden listings help nobody
until a photo lands. The status report gives them their own line for exactly this reason.

### Four refusals, four real findings

The address guard refused four creates and every refusal was worth more than the write would have been:

- **An ID-TRUNCATION duplicate.** Two Thomas Jefferson records share the hash `eb3d06a2` and one id is cut
  mid-word (`at-thomas--eb3d06a2` vs `at-thomas-jefferson-park-eb3d06a2`). Already catalogued as something
  a phone-normalised duplicate scan finds; here the create guard found it first.
- **Two real venue records with no phone.** `prov-kids-in-motion-at-brownsville-playground` and
  `...at-st-john-s-park` had already been retitled onto the recreation centres in an earlier pass and
  carried no phone at all. The Parks facility pages supply both direct lines, and the source moved from a
  playground page to the centre's own page.
- **An empty neighbourhood answered by a sibling** — the St. John's programme card got Crown Heights the
  moment the venue behind it was identified.

**Generalising: a guard that refuses a CREATE is a duplicate detector for records that already exist.**
This repo already recorded that the address pipeline's write refusals "were all real findings"; the same
is now true one step earlier, before insert rather than after.

## v169 (2026-08-09): "I don't see the results online" — the diagnosis, and the map pin

The owner reported not seeing the new listings. **The writes were reaching Atlas the whole time** —
`classscout.vercel.app/api/public/providers` returned 394 providers including the new ones. Two things
were wrong, one mine and one not:

1. **Every listing this bridge created had `geo: null`**, while 232 of 394 live listings had pins. The
   core app's **map viewport is a real FILTER**, not a display hint, so a listing with a perfect street
   address and no coordinates is absent from the map and from every map-bounded browse. The owner had
   asked for "professional address to map properly" and got the address without the pin.
2. **The public API is CDN-cached** (`x-vercel-cache: HIT`, `age: 28`). A read straight after a write
   returns the pre-write body, which makes a successful write look like a failed one. Bust the cache with
   a throwaway query param before concluding anything from a live read — a fresh read showed **340 pinned,
   up from 232**, immediately after the batch.

### The geo guard's reason had expired

It accepted only `source: "approximate"` because "this bridge has no real geocoder". That stopped being
true. Widened to allow `nominatim` — the same service that produced the existing live pins — with two
things still refused: a source the bridge cannot perform, and a **centroid-grade** result. A geocoder
answer that only resolves to a neighbourhood is still a centroid, and seven live listings already share
one Upper East Side point from exactly that. 146 pins written, 144 exact and 2 interpolated; 13 dropped,
almost all because a floor or suite in the address (`4B`, `Suite 1506`, `#200`) defeats the geocoder.

**Generalising: widening a guard is legitimate when its stated PREMISE becomes false** — the same test
this repo already applies to clearing a blocker. What is not legitimate is widening it because it is in
the way.

### The placeholder-address hole, walked into twice

`normalizeStreetAddress` returns null for an address with no house number, and **288 live providers store
a neighbourhood name as their address**. So the create path's duplicate check silently skipped every one
of them, and a second Movement Gowanus was created at the real street address while a record with
"Gowanus, Brooklyn, NYC" already existed. Closed with a website-host fallback: same domain, neither
address resolvable to a street, refuse.

### Checking before acting turned nine into two

The owner's spreadsheet verified nine venues this catalogue held only as hidden programme cards, and the
obvious move was to promote all nine. Checking each ADDRESS first showed **seven already have a live venue
record under a different id**. Only Chelsea Piers' Chelsea field house (six hidden programme cards, none
live) and Prospect Park YMCA (seven) were genuinely stranded — the retire-first mistake in the data. Both
promoted; the claim of nine would have produced seven duplicates.

### The unit in the address defeats the geocoder — strip it for the lookup, never for the record

Every address the first two geocoding passes dropped carried a floor, suite or apartment: `4B`,
`Suite 1506`, `#200`, `2nd Floor`, `Level 2`, `SC1`, `Lower Level`. Nominatim reads those as part of the
street line and fails to match the building. Retrying against the building alone recovered **11 of 13** —
Beyond Boxing, Brooklyn Bridge Fencing, My Gym Park Slope, Church Street Boxing ×2, Starrett City Boxing,
Apex for Youth, Mo'Motion, Fencers Club, Court 16 FiDi and Shinkai Dojo.

**The stored address is deliberately left alone.** A family needs "Suite 545" to find the door; only the
geocoder needed it removed. Stripping the unit from the record to make a lookup succeed would trade a
family's ability to find the room for a pin on the building.

The one that still misses, Tim Morehouse at `2710 Broadway (at 104th St), 3rd Floor`, fails on the
parenthetical cross-street rather than the floor — a second, different shape worth stripping next.

## v170 (2026-08-09): the image gate, proved by experiment — and the licence wall behind it

### The core system DOES still require an image. Proved, not inferred.

Told that images were no longer used, this loop published twelve imageless listings. They were complete —
street address, phone, category, neighbourhood, own website, written copy — and the live public API
served **none** of them. Adding a real photograph to six, **changing nothing else**, moved all six from
absent to served and the endpoint's total from 394 to 400.

The gate is in two places in the deployed read path, and either alone is sufficient:
`buildProviderListQuery` sets `image: { $type: "string", $ne: "" }`, and `isPublicProvider` calls
`isRenderableListing`, which requires an `i.ibb.co` URL.

**The lesson is about method, not about images.** A directive that contradicts code you have read is a
reason to TEST ONE RECORD, not to publish twelve and report them as revealed. One listing would have
settled it in ninety seconds; instead a status update claimed coverage that did not exist.

### A photograph of another branch is not a photograph of this place

Four of ten operator sites were refused on the evidence of the filename alone, and each would have passed
any technical check: The Little Gym's **Tribeca** page serves an image from `/ontario-kingston/`;
Movement's **Gowanus** youth page has `LIC_TheCliffs_2023` as its og:image — the operator's Long Island
City gym. Imagine Swimming and My Gym Tribeca publish no usable photograph at all.

### NYC Parks publishes no venue photographs, and Commons is licence-blocked

Neither the facility pages nor the park pages carry a single image of any recreation centre, so the
eleven Parks venues cannot be unblocked from the operator's own site the way a private operator's can.
Wikimedia Commons has good photographs of most of them — and **almost all are CC BY or CC BY-SA, both of
which require attribution the `providers` schema has no field to carry.** Restricting to CC0 and public
domain yielded **1 of 12** (McCarren Play Center).

Publishing a CC BY-SA photograph uncredited would breach its licence, so the other eleven stay imageless
pending an owner decision on where attribution would live. **Recorded as a blocked decision rather than
quietly resolved either way** — the tempting move is to use the better photo and say nothing.

### Two categories are switched off for browse — so creating in them is creating nothing

Measuring every live Manhattan/Brooklyn sport listing against what the public API actually returns: **71
are in the database and not served.** 15 are the image gate. Of the 56 that DO carry a valid image:

| category | not served |
| --- | --- |
| Drop-In Activities | 38 |
| Birthday Parties | 12 |
| Classes | 6 |

That is `isBrowseCategoryEnabled` doing its job, not a defect — but the operational consequence is sharp:
**a listing created as `Drop-In Activities` or `Birthday Parties` is invisible by construction.** Until
the core developer confirms otherwise, this loop creates only `Classes` and `Camps`, and the coverage
target is counted from those two.

**And the status report now measures what the API SERVES, not what the database holds.** It spent a day
reporting "397 visible to families" while counting database rows; the true reachable figure was 326. A
report that measures the wrong side of a gate is worse than no report, because it is believed.

### Two categories are switched off for browse — so creating in them is creating nothing

Measuring every live Manhattan/Brooklyn sport listing against what the public API actually returns: **71
are in the database and not served.** 15 are the image gate. Of the 56 that DO carry a valid image:

| category | not served |
| --- | --- |
| Drop-In Activities | 38 |
| Birthday Parties | 12 |
| Classes | 6 |

That is `isBrowseCategoryEnabled` doing its job, not a defect — but the operational consequence is sharp:
**a listing created as `Drop-In Activities` or `Birthday Parties` is invisible by construction.** Until
the core developer confirms otherwise, this loop creates only `Classes` and `Camps`, and the coverage
target is counted from those two.

**And the status report now measures what the API SERVES, not what the database holds.** It spent a day
reporting "397 visible to families" while counting database rows; the true reachable figure was 326. A
report that measures the wrong side of a gate is worse than no report, because it is believed.

## v171 (2026-08-09): the image gate removed — a mechanical audit of everything still not served

The core developer removed the image requirement. **Verified before reporting**, which is the lesson from
yesterday: six imageless listings went from absent to served and the endpoint total moved 401 → 416, the
exact count of imageless records.

`src/scripts/blockAudit.py` attributes a reason to every provider the live API does not return. It is
deliberately built to answer the owner's actual question — *which are blocked by the image ALONE* — which
means attributing per record rather than reporting a total, and separating "image was the only fault"
from "image was one of several".

### Result: **ZERO blocked by the missing image alone.** The fix is complete.

Of 1,120 records, 416 are served and 704 are not:

| primary reason | count |
| --- | --- |
| hidden (retired by this loop or the pipeline) | 371 |
| category switched off for browse — Drop-In Activities | 126 |
| category switched off for browse — Birthday Parties | 52 |
| **unexplained** | **133** |
| no borough | 7 |
| quarantined | 5 |
| scraped chrome in the copy | 5 |
| borough outside the served regions | 5 |
| **blocked by the missing image alone** | **0** |

### The 133, and why they are reported as unexplained rather than bucketed

Three hypotheses were tested and each was disproved by the data rather than by argument:

- **Region gating** — 59 are Bronx / Queens / Staten Island / LA, which it would explain. It does not
  explain the other **74, which are Manhattan and Brooklyn**.
- **Activity gating** — the unserved carry Art, Music, STEM, Theater. But Art (13), Music (18), Theater
  (9) and Science (8) all appear among SERVED listings too, so the activity alone does not decide it.
- **`discoveryTier: { $ne: "browse_only" }`** — in `buildProviderListQuery`, and a filter this audit had
  originally missed. Also disproved: **12 served listings carry `browse_only`.**

So the residue is real and is 74 Manhattan/Brooklyn records (53 Classes, 21 Camps) that pass every check
observable from outside this bridge. **Recorded as unexplained rather than assigned to the nearest
plausible bucket** — an audit that always has an answer is an audit that is guessing, and each of these
three hypotheses would have looked convincing if I had stopped at the first one.

## v172 (2026-08-09): recategorising out of a browse-disabled category — and a test I ran badly

142 live Manhattan/Brooklyn listings sat in `Drop-In Activities` or `Birthday Parties`, both switched off
for browse and therefore invisible. The tempting move is to sweep the lot into Classes and watch coverage
jump. **That would be lying in the field a family filters on** — a museum's open play session and a bounce
park genuinely ARE drop-in.

**The test is what the record asserts itself to be, read from its own NAME.** A keyword sweep over the
COPY produced immediate errors: "Corlears School Birthday Party Rentals" reads as a class if you match
"School" and ignore "Birthday Party". Name-driven, 142 → 19 candidates, of which three were still wrong
and excluded by hand: Dance Theatre of Harlem's "Saturday Youth **DROP-IN**" (the name says it), the
Guggenheim and Brooklyn Bridge Park programmes (drop-in by design), and Prep Academy Tutors ("Academy" is
the brand; an earlier pass resolved its address to Toronto).

**13 recategorised, 12 immediately reachable.** One test record first — Manhattan Volleyball Academy alone,
416 → 417 — before the other twelve.

### The outlier was worth more than the batch

`prov-new-york-martial-arts-academy-brooklyn` stayed invisible, and carried three defects: a Jeet Kune Do
academy tagged **`["Art", "Theater"]`**; a record named "…**Brooklyn**" filed under **Manhattan / Midtown**;
and no street address. The operator's own locations page puts its Brooklyn academy at 188 Dupont Street,
Greenpoint — so the NAME was right and the borough was wrong. Also a split candidate: nymaa.com lists five
locations against this one record.

### A methodological error, recorded because it nearly became a false conclusion

I changed four fields on that record at once and it became served, and I began writing up "activity
gating explains the residue". **It does not, and my test could not have shown that** — with four fields
changed there is no attribution. Checking properly: of 78 unserved Manhattan/Brooklyn Classes and Camps,
only **12** carry no activity that ever appears on a served listing. The other 66 carry Dance, Theater,
Art, Music, Science — all of which appear on served records.

Four hypotheses for the residue have now been tested and disproved by data: region, activity,
`discoveryTier`, and category. **Change one field per test, or the result explains nothing.**

### The target is moving while being measured

Between two consecutive reads the served count went **429 → 507**, and `Drop-In Activities` went from
0 served to 75. The core team is deploying as this loop runs. Any causal claim about the read path needs
a timestamp attached, and an audit result is a photograph rather than a fact.

## v173 (2026-08-09): the residue explained — it is arts and academic, not sport

Four hypotheses for the 130 unserved-but-apparently-fine records had been tested and disproved (region,
`discoveryTier`, category, a naive activity set). The fifth attempt found it by measuring the **served
rate per activity** across a like-for-like pool (Manhattan/Brooklyn, Classes or Camps, imaged, not hidden):

| activity | served / total |
| --- | --- |
| STEM | **0 / 17** |
| Art | 16 / 53 |
| Music | 20 / 49 |
| Theater | 10 / 19 |
| Science | 8 / 14 |
| Soccer, Martial Arts, Swimming, Gymnastics, Fencing, Volleyball … | **100%** |

And by `primaryActivityType`, the unserved are Art (26), Music (14), STEM (12), Theater (8); the served
are Soccer (50), Martial Arts (41), Swimming (37), Basketball (29), Gymnastics (28). **Browse is scoped
in a way that excludes arts and academic listings.** Not a defect, not a sport problem, and not this
bridge's to change — but it does mean an arts listing created here is invisible, exactly as a Drop-In one
was.

Also ruled out on the way, so nobody re-tests them: **pagination is not a factor** (paged reads return
nothing the un-paged read misses), and **no single FIELD separates served from unserved** — it is a
value-level check, which is why field-presence diffing found nothing.

### The part that was actually actionable: 16 unreachable SPORT listings

Nine sat in Birthday Parties or Drop-In Activities, and most were gyms and swim schools whose entire
business is graded classes with party hire as a sideline — The Little Gym (two branches), Jodi's Gym,
Joy Gymnastics, NY Kids Club, NY Sports 4 Kids, Physique Swimming. Eight recategorised.

**Two deliberately not.** ONEYOGAHOUSE's record is named "Kids Yoga PARTIES" and is one — recategorising
it would make it reachable and would be a lie in the field families filter on, so it is marked `confirmed`
instead, which records that the question was asked. Kids in the Game at PS 261 runs inside a public school
and is already catalogued as a citywide operator with no venue of its own; the real question there is
whether it should be a listing at all, so it is `needs_human` rather than quietly recategorised.

**A second defect surfaced while reading one of them**: `prov-physique-swimming-battery-park-city` stored
its neighbourhood as **Harlem**. The name was right and the field was wrong — the same shape this
catalogue has recorded repeatedly.

**Sport coverage now: 398 in the database, 390 reachable.** The remaining 8 include the three Tennis
Innovators courts, whose only distinguishing feature is a missing `publishedAt` — still with the core
developer.

## v174 (2026-08-09): US English in family-facing copy (owner directive)

*"We use and have to use US English on the site so every content, listing should be rephrased to US
English if required."* **297 records** carried British spelling in their descriptions — "programme" 389
times, "centre" 129, plus neighbourhood, organisation, travelling, defence, enrolment. A large share was
written by this loop.

### Proper nouns are what make this more than a word list

Treasure Trunk Theatre, American Ballet Theatre, Dance Theatre of Harlem, Lula Washington Dance Theatre,
Jalopy Theatre and New York Theatre Ballet are all spelled that way **because it is their name**. A
catalogue that renames American Ballet Theatre has done something worse than leave a British spelling in
place. Two rules, both verified before writing (zero capitalised `Theatre` altered across 297 records,
23 occurrences preserved):

- a CAPITALISED `Theatre` is never converted — only the lowercase common noun;
- nothing capitalised and directly preceded by another capitalised word is converted, because that is
  proper-noun position. A sentence-initial capital IS converted; a capital after a full stop is not
  evidence of a name.

**Provider NAMES were checked separately and mostly left alone.** Of 11 carrying a British spelling, 10
are genuine business names; exactly one is a generated title where it is a common noun (`Prospect Park
YMCA — School-Age Swim Programme`).

`britishSpellingError` in `copyQuality.ts` now refuses it on write, with the same exemptions and with the
real business names pinned as must-not-flag test cases.

### A bug that was literally invisible

The pattern list was written through a non-raw Python heredoc, so **every `\b` became a literal backspace
byte**. The file rendered as `/\bprogrammes?\b/g` in a terminal and matched nothing; the guard passed
every input silently. 34 corrupt bytes. Only a failing test of my own caught it, and a repo-wide check
confirmed the corruption was nowhere else. **When a regex mysteriously matches nothing, check the bytes,
not the rendering.**

### A word list is only as complete as the last time somebody read real copy against it

Re-scanning AFTER the sweep found a second family the spelling list had missed — not `-ise/-our`
substitutions but British USAGES: `whilst`, `amongst`, `maths`, `jewellery`, `catalogue`, `storey`, and
the `-ing` form of `emphasise`, which the list held in its `-e/-es/-ed` forms only. 12 more records.

### The refusal was worth more than the fix — BARS Boxing

One record came back as a copy-quality refusal, and following it beat the spelling change it blocked.
Both descriptions were the site's navigation menu, which is also why the listing was not being served.
The chrome contained a Staten Island address contradicting the stored Brooklyn one, and the operator's own
contact page settled it: two gyms, 1665 Richmond Rd (Staten Island) and 24 Cobek Court (Brooklyn) — and
the stored `1601 Gravesend Neck Road` **belongs to neither**. Copy rewritten, address corrected, split
candidate recorded, plus a note that `New York Fight Club Youth Boxing` is live at the same Cobek Court
address sourced to a sanctioning-body registry.

## v175 — Prospect Lefferts Gardens round: the scarcity ceiling is a fact about the neighbourhood

Worked the scarcest sport neighbourhood in the catalogue (zero served sport listings). The round produced
two corrections and three new listings, and — more usefully — an answer to a question the target of "10
new per neighbourhood" assumes away.

**[SUPERSEDED same day — see v182 and `docs/source-registry.md`. This paragraph measured OpenStreetMap's
coverage and called it the neighbourhood's reality; one hour of testing other source tiers surfaced
roughly ten real children's activity operators in or on the edge of PLG that OSM does not carry. Kept in
place rather than deleted, because the useful lesson is that a single source's count is never a
neighbourhood ceiling — the identical mistake shape as the 50-card contamination sample, arrived at from
a map instead of a sample.]** ~~PLG cannot support ten children's sport listings, and that is measurable rather than an opinion.~~ An
Overpass sweep of the whole polygon (every named feature carrying a leisure/sport/amenity/shop/office tag)
returned 31 candidates. The children's sport venues among them are three. The rest are three adult chain
gyms, the parks, some childcare, and LeFrak Center at Lakeside — which is already carded six times over
under Prospect Park. Delivering ten here would require inventing seven.

### What was NOT created, and why each one looked creatable

| Candidate | Looked like | Actually |
| --- | --- | --- |
| Prospect Gymnastics PLG, 535 Rogers Ave | A press article says it opened there; a search summary repeats it | The operator's own contact page lists exactly two gyms (Ditmas Park, Bed-Stuy), its nav offers programs and calendars for those two only, and `/plg/` 404s |
| Elite Martial Arts, 1244 Nostrand Ave | A "Which Location?" page offers three addresses, one of them in PLG | Every current page's footer, the schedule and the contact page give 1690 Atlantic Avenue alone; the schedule is one undifferentiated timetable, not three; and the Nostrand site's own domain returns "Domain disconnected" |
| 47 BJJ Coop, 396 Rogers Ave | Real, open, a mapped sports centre with a phone and an email, and its homepage says it serves the PLG/Crown Heights community | **Adults only.** Its own schedule page lists every class at 7am or 6–9pm, with no age band and no youth program anywhere on the site |

The 47 BJJ case is the one worth remembering: it passes the entity check, the physical-location check, the
in-market check and the source-quality check. Only reading the schedule for an age band catches it. That is
the already-catalogued *unevidenced children's claim* defect (NYC Footy), reached from the opposite
direction — there the card asserted a children's clinic, here nothing but the reviewer's assumption would
have.

### The round's actual find was a listing the catalogue already had

`prov-skate-yogi-kids-brooklyn` stored `address: 140 Empire Blvd` — Prospect Lefferts Gardens — with
`neighborhood: "Williamsburg"`, which is SKATEYOGI's OTHER site, 6.5 km away. So the neighbourhood with
zero sport listings already had one, filed under its sibling's name. **No amount of sourcing new
businesses finds that.** Corrected onto PLG, and the Williamsburg site — which had no listing at all —
created. One listing per physical location, reached by correcting and creating rather than by a split,
because the existing record was always about one of the two.

Same shape one street over: World Martial Arts Center (Happy Kicks), 1120 Washington Ave, was filed under
Crown Heights. **ZIP 11225 spans both neighbourhoods so it cannot settle the question**, and the real
boundary is Empire Boulevard, which is invisible in a house number. The pin (40.66194) is south of where
Empire crosses Washington (~40.6637). Corrected, and the listing filled out from the operator's own pages:
it had no phone, no email, no photograph and no age bands despite running an afterschool program.

### Turned into scans

- **`src/scripts/pinDrift.py`** — flags any live listing whose map pin is ≥3 km from the centroid of the
  neighbourhood it claims. Deliberately NOT a ZIP-to-neighbourhood table: this repo already records why a
  hand-built map that is 80% right is worse than none. Nominatim is asked once per distinct neighbourhood
  NAME for that neighbourhood's own centroid, and nothing is inferred about where a boundary runs. A hit
  is a lead — a big distance can equally mean the ADDRESS is wrong (the parent-HQ defect, five confirmed
  instances) — so the threshold is loose enough that a borderline record never appears.
- **`src/scripts/neighborhoodSportSweep.py`** — per-neighbourhood Overpass sweep, the thing that actually
  worked when web search did not. A search for a small residential neighbourhood returns borough-wide Yelp
  and ClassPass pages because the ranking has nothing local to show; Overpass answers the real question and
  returns names, house numbers, phones and websites together.

**Two bugs in the sweep's own filter, both already in this catalogue under other names.** `sport` as a
substring matched `public_tranSPORT` and returned three MTA bus depots, plus "Sports & Imports Auto" — the
`Art`-inside-`mARTial` trap. Fixing it with `\b` word boundaries then silently dropped every
`leisure=sports_centre`, because **`_` is a word character so `\b` never fires between `sports` and
`_centre`** — a fix that broke more than the bug. Both are covered by the filter's own test cases now.
Normalise `_ ; =` to spaces before matching anything against an OSM tag blob.

## v176 — 70 live listings had a map pin in the wrong place, and the map is a FILTER

The biggest defect this loop has found in one pass, and it was invisible to every scan before today
because **no single field contradicted itself**. Prospect Park Zoo stores `450 Flatbush Ave` — correct —
and a pin at `40.8615,-73.8905`, which is the Bronx, and specifically the Wildlife Conservation Society
headquarters. The HQ-address contamination already catalogued here five times over turns out to have a
twin in the COORDINATES, and clearing the address never cleared the pin. New York Aquarium is pinned at
that same Bronx point. Gotham Tennis Academy, 160 Columbus Avenue on the Upper West Side, was pinned on
Staten Island, 35 km away. Row New York's Canarsie boathouse was pinned in Manhattan.

**Why this outranks an ordinary wrong field.** The map viewport is a real filter in the core app, not a
display hint. A listing with a wrong pin is not merely mislabelled — it is served to families browsing a
neighbourhood it is not in, and absent from the one it is in, while looking perfectly confident on the
map. Ten of the 70 were pinned outside their own borough.

### How it was found — three scans, each answering what the previous one could not

1. **`pinDrift.py`** measures each stored pin against the centroid of the neighbourhood the record claims.
   Deliberately NOT a ZIP-to-neighbourhood table: this repo already records why a hand-built map that is
   80% right is worse than none. Nominatim is asked once per distinct neighbourhood NAME for that
   neighbourhood's own centroid, so nothing is inferred about where a boundary runs. 152 hits.
2. **`pinJudge.py`** re-geocodes each hit's OWN ADDRESS to separate the causes, because reading the first
   run showed the design was aimed at the wrong field — "160 Columbus Ave, claims Upper West Side, 36.7 km
   away" is not a neighbourhood error. Result: **67 stale pins, 10 wrong neighbourhoods, 69 placeholder
   addresses with nothing to conclude.** Reporting those three merged would have been a count nobody could
   act on.
3. **`pinFix.py`** re-derives and writes, with a borough guard.

### The guard, and why it is not optional

The first classification run trusted Nominatim, which quietly resolved `76 Ninth Avenue, New York, NY
10011`, `110 Fifth Avenue, New York, NY 10011` and `2180 First Avenue, New York, NY 10029` to a cluster
around 40.91,-73.81 — **Westchester**. Numbered avenues exist in every town in the region and the ZIP in
the string does not stop the fallback. **Two of those three records already STORE that Westchester
point**, so the pipeline made the identical mistake and a naive re-geocode-and-write would have written
the error back as a correction. Every candidate is now checked against its own borough's bounding box, a
borough-qualified query is tried first, and anything that will not resolve in-borough is refused and
reported rather than written. Two were refused on exactly that ground.

**70 pins re-derived and applied**, `geo` only, nothing else on those records touched.

### The general lesson

A cross-field consistency check finds defects that no single-field check can, but **the field it flags is
not necessarily the field that is wrong**. This scan was built to catch wrong neighbourhoods, and 96% of
what it found was wrong coordinates. Build the disambiguating second step before believing the first
step's label — and note this is the same shape as the already-recorded finding that a
`neighborhood`-in-`address` check scored placeholders healthy and real data broken.

## v177 — Brooklyn round 2 and Manhattan round 1: what a map database costs and buys

Six more listings, sourced from `neighborhoodSportSweep.py`. The sweep is a LEAD GENERATOR and this pair
of batches priced that qualifier exactly:

- **It got an address flatly wrong, in a way that would have fabricated a location.** OpenStreetMap puts
  Brooklyn Lifestyle Athletic Club at 1500 Paerdegat Avenue North in Bergen Beach, which is why it
  surfaced. The operator's own site says, twice and in capitals, "NEW LOCATION! Ebenezer Urban Ministry
  Center, 660 Powell Street" — the club has moved to BROWNSVILLE. Created there.
- **It was contradicted by an operator and lost.** The sweep put Amerikick at 529 14th Street; the record
  held the bare fragment "529 5th Ave.", which looked like the weaker value and was the right one. Same
  corner, which is how the map came to disagree. The catalogue was right and the map was not — the
  opposite of the BKLA case in the same batch.
- **It found a dead URL.** Roosevelt Island Sportspark's OSM website is `rioc.ny.gov/Sportspark.htm`,
  a 404; the live page is `/community/sportspark`. Its OSM address (300 Main Street) is also wrong; the
  facility is at 250 Main Street.
- **It works.** Kaizenkan Aikido Dojo, Oishi Judo Club, Gotham Archery Manhattan and the 14th Street Y
  were all confirmed against the operator's own pages with address, phone, email and age bands intact.

**Manhattan's sweep behaves differently from Brooklyn's and it is worth knowing before running it.**
Nominatim's bounding boxes for Manhattan's micro-neighbourhoods overlap heavily — Koreatown, NoMad and
Rose Hill returned largely the same 70-odd venues — and the borough is dense with adult boutique fitness
that tags identically to a children's school. Raw count much higher, yield per candidate much lower.

**Two records were deliberately not "improved".** Ardon Sweet Science Gym has two addresses in circulation
(the record's 143 30th Street, OSM's and Yelp's 861 4th Avenue, around the corner from each other) and its
own contact page returns a 500 error, so the address is left alone with the conflict written into
`fieldVerifications`; what could be settled was — both are ZIP 11232, so the empty `neighborhood` became
Sunset Park. And the 14th Street Y is stored under EAST VILLAGE, its real neighbourhood, not under one of
the three zero-coverage neighbourhoods whose overlapping sweep boxes surfaced it. Writing a zero-coverage
name there to move a counter would be precisely the fabrication this scarcity work exists to avoid.

## v178 — NYC Parks recreation centers, and the address guard as a report again

`src/scripts/recCenters.py`. A recreation center is one of the very few sources where the two checks that
cost this loop the most time — is the entity real, is it a fixed place a child attends — are satisfied by
the source itself. The department publishes name, street address, cross streets, phone and closure
notices for every center, grouped by borough.

Nine open Manhattan and Brooklyn centers were checked. **Four listings resulted** (Herbert Von King
Cultural Arts Center, Red Hook, Shirley Chisholm, and Pelham Fritz by promotion), and the other five are
the interesting half.

### The address guard refused four creates, and every refusal was correct

Already recorded here: *"a guard built to prevent bad writes is worth reading as a REPORT."* It happened
again, and this time it caught **my own bad reconnaissance**. A name-match against the pool reported
Chelsea, Highbridge and J. Hood Wright as having no venue card. They all do. The check printed only the
first two hits per center, and `prov-chelsea-recreation-center` sat third behind two unrelated records
that merely contain the word "Chelsea". **Truncating a hit list for display turned "exists" into
"missing"** — the same shape as the sample-versus-census error already recorded twice in this document,
arrived at from a third direction. Print the whole list or print the count; never print the first two and
read a conclusion off it.

### The one that IS a promotion, not a create

Pelham Fritz's only record at 18 Mount Morris Park West was *"Summer Sports Experience: Various Sports at
Pelham Fritz Recreation Center"* — a season's program, part of the fifteen-card NYC Parks cohort this repo
already records as all carrying the Parks Department's Arsenal headquarters address. Creating the venue
beside it was refused, correctly. So the program card **became** the venue: renamed, repointed from the
Parks homepage to the center's own page, and given the building's own number in place of **212-360-1305,
the Parks central switchboard** — a number that reaches no gym, and the same shape as the eighteen live
records already found storing `311`.

### Lifecycle exclusions, stated rather than silently dropped

- **Brownsville Recreation Center** is open, and its own page says the indoor pool and gymnasium are both
  closed for construction with only the Golden Age side in use. The sport facilities *are* the sport
  listing, so listing it would send a family to a locked gym. Not built.
- **J. Hood Wright** is closed to public access July 6 – August 21 while it runs its summer camp. Already
  carded, so this is recorded in its own listing rather than acted on.
- Four centers were excluded outright as temporarily closed: Hamilton Fish, Hansborough, Thomas Jefferson,
  Tony Dapolito in Manhattan; McCarren Play Center, Metropolitan and Sunset Park in Brooklyn. **Sunset
  Park Recreation Center was in the Overpass queue as a live candidate** — the Parks page is what caught
  it.

### Phone versus fax

Four of the nine pages list a Fax immediately after the Phone, and a naive "first ten-digit number on the
page" grab takes the wrong one on at least Highbridge (fax 212-927-2063) and Red Hook (fax 718-722-7341).
The parser reads the labelled field. Worth remembering wherever a government or institutional page is the
source — a fax number passes every shape check a phone validator applies.

## v179 — "Which listings already sit in a neighbourhood showing zero?" — 105 leads, 4 corrections

`src/scripts/inZeroNeighborhood.py`. The Prospect Lefferts Gardens round's best find was not a new
business but a listing the catalogue already had, storing a PLG address under `neighborhood:
"Williamsburg"` — the operator's other site. PLG showed zero sport listings while already having one.
That is the cheapest coverage there is: the venue is already verified, published and photographed. So
this scan asks the question generally — for every neighbourhood still at zero, which live sport listings
are PINNED inside its bounding box while filed under a different name?

**It only became possible today.** Running it before the 70 pins were re-derived would have chased
coordinates rather than listings.

### The four that survived, and the honest ratio

- **North Brooklyn YMCA → Cypress Hills.** 570 Jamaica Avenue is on Cypress Hills' main spine; East New
  York is south of Atlantic Avenue. The branch's NAME describes the Y's service area, not the building's
  neighbourhood — the same brand-name-in-a-place-field shape as Williamsburg Soccer Club, whose clubhouse
  is in Greenpoint.
- **Vanderbilt YMCA (224 E 47th) and Tim Morehouse East Side (235 E 49th) → Turtle Bay**, both filed
  under the broader Midtown East. Store the real neighbourhood; the page's grouping folds it.
- **Bredwinner Youth Boxing (1 E 28th at Fifth) → NoMad**, filed under Midtown.
- Plus **Joy Gymnastics → Sunset Park**, filling an EMPTY field (not a zero-coverage win, still a gap).

**105 leads, 4 corrections.** The ratio is the finding. Nominatim's bounding boxes for Manhattan's
micro-neighbourhoods overlap so completely that Gramercy, Gramercy Park, Rose Hill, NoMad, Koreatown and
Murray Hill are effectively the same rectangle — the same twelve records were returned under each. **A
bounding box is not a polygon**, and a scan built on one has to be read as "worth checking against the
real boundary", never as a refile list.

### Two deliberate non-actions, and the pressure worth naming

- **John J. Carty Park** is on Fort Hamilton Parkway *between 94th and 101st Streets* — it straddles the
  Bay Ridge / Fort Hamilton line, and its stored address (9941) is the southern end. Fort Hamilton shows
  zero sport listings and refiling it would have closed that. **That is exactly why it was not done.**
  The exactly-one-real-answer rule does not stop applying because the wrong answer would improve a
  counter, and "a precise wrong answer is worse than a coarse right one" is the rule this loop is most
  likely to break under a coverage target.
- **The four South Slope candidates** (450–555 Fourth and Fifth Avenues, filed as Park Slope) sit where
  Park Slope and South Slope have no crisp line. Left as filed.

Worth stating plainly because the scarcity brief creates a standing incentive to resolve every borderline
case toward the empty neighbourhood. The scan is useful precisely to the extent it is allowed to return
"no" — and here it returned "no" 101 times out of 105.

## v180 — 26 live sport listings appeared in no neighbourhood browse at all

A live listing with an empty `neighborhood` is served by the API and reachable by search, but it appears
in NO neighbourhood browse — so to a family browsing by where they live, it does not exist. 26 live sport
listings in Brooklyn and Manhattan were in that state. **This is cheaper coverage than sourcing anything
new**, because the venue is already verified, published and photographed; only one field is missing.

Eight were filled from the listing's OWN stored address, no research needed: Dribbl Basketball and PGA
Summer Camps at Golfzon → Downtown Brooklyn; Brooklyn Speed and Power and Brooklyn Crescents Lacrosse →
Dyker Heights (both on Seventh Avenue at 92nd Street); Gym X Boxing → Bedford-Stuyvesant; Apex for Youth
→ Lower East Side; Mo'Motion → Central Harlem; Underground Boxing → Gravesend. Brooklyn's empty count went
14 → 8 and Manhattan's 12 → 10.

**The other eighteen were left, and the reasons matter more than the count.** Several genuinely have no
fixed venue and the empty field is the honest answer (Togetherhood, Soccer Legion FC, Mindful Sports
Summer Camp, whose own address field says the 2026 venue is not yet published). SPORTIME sits at 1
Randall's Island, which the neighbourhood vocabulary does not cover — the same taxonomy gap already
recorded for out-of-borough listings, appearing this time INSIDE Manhattan. St. Patrick's CYO stores the
compound "Bay Ridge / Fort Hamilton", which is a split or research question rather than a fill. And Five
Points Academy was deliberately left at borough grain in an earlier pass because 148 Lafayette Street sits
on the SoHo / Little Italy / Chinatown boundary and sources disagree — that decision is already in this
document and was not quietly reversed to move a counter.

## v181 — the sweep queue, and the address guard as the dedupe of record

`src/scripts/rankSweepQueue.py` turns a raw sweep into a workable queue: drop the national adult chains
and sporting-goods retail by name, score by how likely a venue is to teach children (venue kind, sport
tag, a child word in the name, having a website and a phone), and dedupe on address. Run across all 92
browsable Brooklyn and Manhattan neighbourhoods it produced **75 candidates not already in the pool**,
saved as `src/scripts/sportVenueQueue.json` so the next round starts from a list rather than a search box.

**Its dedupe is weaker than the server's, and that is now measured.** Four creates in the last two batches
were refused by the street-address guard for venues that already exist — Sheridan Fencing Academy and
Brooklyn Martial Arts among them — because the queue compares a 22-character normalised prefix while
`normalizeStreetAddress` on the server does the real job. "1801 1st Avenue" and "1801 1st Ave, New York,
NY 10128" do not match on prefix. **Treat the queue's `known` flag as a hint and the create endpoint's
refusal as the answer**; the refusals cost one request each and have been right every time.

### A name collision worth recording

`brooklynmartialarts.COM` is a school on Livingston Street in Downtown Brooklyn. `brooklynmartialarts.NET`
is **Amerikick Park Slope**, a different business, enriched earlier in the same session. Two real
operators, one name, two TLDs. That is the fourth instance of the shared-name shape in this catalogue
after United Soccer Academy / Brooklyn United, the two fencing clubs, and the two Williamsburg Soccer
Clubs — and the reason each was checked against its own site rather than merged on name similarity.

## v182 — the discovery approach was the ceiling, not the city: deep research into sources (owner directive, 2026-08-09)

The owner rejected the v175 conclusion that a ~60,000-resident neighbourhood supports three children's
sport venues — correctly. The claim measured OPENSTREETMAP'S COVERAGE and reported it as reality. The
research that followed tested every candidate source from this environment, produced the living source
registry (`docs/source-registry.md` + `src/scripts/sourceRegistry.json`, owner-directed: discovery AND
enrichment AND maintenance, refreshed on a stated cadence), and re-ran Prospect Lefferts Gardens as the
pilot.

### The pilot verdict, on the same neighbourhood, same day

The index tier and shared-venue expansion surfaced — in one hour — operators the Overpass sweep is
structurally blind to: **Discovery Kids** (448 Rogers Ave, sports summer camp), **Pixie Pods** (448
Rogers Ave), **Collective Kind** (511 Rogers Ave), **Brooklyn Trails** (Prospect Park at Lincoln Rd),
and the **Major Owens Center** (1561 Bedford Ave, 11225), one building where THREE separate operators
run children's programs: New Heights (basketball), Imagine Swimming (6-lane pool), Asphalt Green
(multi-sport turf field). With SKATEYOGI and World Martial Arts Center already corrected onto PLG this
morning, the honest inventory is roughly TEN, not three. Each Major Owens tenant qualifies for its own
listing under the rented-venue rule (a continuing program at a fixed address — the Physique Swimming
precedent), and none of them has one yet: recorded as the next PLG creates.

### What was tested and what came back (all 2026-08-09, from this environment)

- **NYC Open Data (Socrata): WORKING, no key.** Including the decisive one: **NTA 2020 neighbourhood
  POLYGONS as GeoJSON** (`9nt8-h7nd`) — real boundaries, which retire Nominatim bounding boxes from
  every per-neighbourhood scan. Also rec centers, athletic facilities (updated July 2026), and a
  14-day Parks events feed usable as a maintenance signal.
- **Index mining over walled directories: WORKING, and it is the substitute for scraping.** Yelp and
  Sawyer bot-wall curl, and **headless Chromium cannot CONNECT through the egress proxy at all**
  (ERR_CONNECTION_RESET on example.com itself, proxy configured, CA trusted — recorded so nobody
  rediscovers it). But domain-scoped search over their indexes returns titles that literally carry
  `NAME - ADDRESS - phone`. The index is the dataset; the operator's own site remains the verifier.
- **Franchise/chain locators: WORKING** and now a registry tier with a maintenance role — a branch
  vanishing from its own chain's page is the strongest closure signal there is.
- **Parent directories (Mommy Poppins, Macaroni KID, Brooklyn Bridge Parents, New York Family):
  PARTIAL** — guides and articles reachable, directory listings render client-side; reach them via
  index mining. Date-check everything: a Macaroni KID result still asserts Prospect Gymnastics PLG at
  535 Rogers Ave, which the operator's own contact page disproves.
- **NYS DOH children's camp permit roll: NOT PUBLISHED as a dataset** (three portals searched). Every
  legal NYC day camp holds a permit, so the roll is a camp CENSUS — owner ask #1 (311/FOIL).
- **Yelp Fusion / Google Places: NO KEYS.** Fusion is free at 5,000 calls/day with structured
  `is_closed` — owner ask #2, and the cheapest automation of the closure sweep available anywhere.

### The rules this adds

1. **A single source's count is never a neighbourhood ceiling.** "Thin" may only be concluded after the
   full registry stack has run, and is recorded as "these sources see N", sources attached.
2. **Neighbourhood geometry comes from NTA polygons**, never from a geocoder's bounding box.
3. **A shared venue is a discovery multiplier** — whenever a round touches a multi-tenant building, its
   operator roster is expanded before the round moves on.
4. **Sources carry `lastVerified` and a cadence**, and the daily/weekly/rolling ritual in
   `docs/source-registry.md` is part of the maintenance loop, not an aspiration bolted onto it.

## v183 — SerpAPI key received and wired in (owner, 2026-08-09)

Minutes after the v182 research shipped with "no structured place API" as its top gap, the owner
supplied a SerpAPI key. Tested live: `engine=google_maps` returns 20 structured places per call —
name, full street address, phone, type, gps, place_id, rating, hours, and "Permanently closed"
markers. Two calibration calls immediately: (1) found **New Generation School of Martial Arts, 395
Maple St Ste A, 11225** — a real PLG dojo with published hours that NO other tier had surfaced,
raising the PLG pilot count again; (2) found a **fourth children's operator at Major Owens** (Globall
Sports Centers) and revealed BKLA's swim actually runs at the Bedford-Union Armory pool; (3) returned
a Sterling, Virginia gym inside a Brooklyn-centred query — the noise specimen that keeps the entity
check mandatory.

Budget is the design constraint: free plan, **250 searches/month**. `src/scripts/serp.py` is the only
sanctioned caller — ledger on every call, 25-call reserve for maintenance emergencies, and free tiers
always queried first. ~2 calls per neighbourhood round covers all 92 with room to spare. Key in
`.env.local` only, never committed.

## v184 — Yelp Fusion key received: the closure sweep is now automatable (owner, 2026-08-09)

Owner ask #2 closed within the hour. `src/scripts/yelp.py` wraps the two modes that matter: radius
discovery (50 structured places per call) and — the bigger prize — **closure checking by phone-join**:
the pool's normalised phone digits are Yelp's `/businesses/search/phone` key, and the response carries
`is_closed`. At 5,000 free calls/day the whole live pool fits in a weekly sweep with one day's budget
to spare. `is_closed=True` is a lead for the human closure check, never an automatic quarantine — Yelp
mis-marks businesses — but the City Treehouse / apple seeds class of defect (a closed business live on
the site) now gets found by a script instead of by luck. Verified live: Prospect Gymnastics and Oishi
Judo both return open, correctly.

Same hour, the owner supplied a second verified spreadsheet (NEXT 20). Cross-checked on receipt: **9 of
20 not yet in the pool**, saved to `src/scripts/ownerVerifiedQueue.json` as the top of the create queue.
The IN-POOL/NEW flags are hints, not verdicts — Jodi's Gym read as NEW against a differently-formatted
stored address, and the create endpoint's street-address guard remains the dedupe of record.

The registry now has THREE structured place sources with distinct strengths: SerpAPI (Google's index,
250/month, hours + permanently-closed markers), Yelp Fusion (5,000/day, is_closed + category aliases),
and NYC Open Data (public facilities, unmetered). Discovery rounds run all three against the same
neighbourhood; disagreement between them is itself a signal worth reading.

## v185 — owner-verified queue worked: 12 creates, and a live zoo/parkour-gym fusion corrected

The reason the loop paused after the DOHMH answer was answering instead of continuing — the owner
called it, correctly. Resumed with the owner-verified spreadsheet queue, worked as two batches.

**Batch A (7):** Karate-Do Ken Wa Kan (Flatiron — first sport listing there), Hinds Combat Sports
(Midtown West, kids 6-17), New York Ninja Academy Manhattan (Hell's Kitchen) AND Brooklyn (Gowanus —
NOT on the spreadsheet; found on the operator's own site while verifying the Manhattan location, one
listing per physical location), El Dojo NYC (Lenox Hill), Supreme Martial Arts UES (Yorkville) and UWS —
per-location phones read from the operator's own footer (UWS 586 Columbus = 212-799-6722, UES 1690
2nd Ave = 212-722-6722), the head-office-number defect avoided at source.

**Batch B (5 + 1 correction + 1 skip):** Elliott's Classes (Morningside Heights, ages 6 weeks-14),
Brooklyn Judo Academy (Bay Ridge), My Gym City Point and My Gym Cobble Hill (both Cloudflare-walled to
this environment — verified through independent listings and the owner's sheet, provenance recorded in
fieldVerifications rather than dressed up as an operator-site read; both publish ONE shared phone,
recorded so the duplicate-phone scan doesn't merge two real gyms), and Elite Swimming NYC (Midwood) —
**first enrichment use of the Yelp Fusion tier on a create**: the operator publishes no phone, Yelp's
structured record for the same name+address carries (929) 548-0178 with is_closed=false, provenance
recorded. Premier Martial Arts was refused by the address guard — it already exists as a live listing —
and Premier's brand name says "Brooklyn Heights" while 75 Smith Street is Boerum Hill, noted for that
record's next enrichment pass.

**The fusion record.** The Brooklyn Zoo create minted a `-2` id, and the collision was investigated
rather than accepted: `prov-brooklyn-zoo-ny` was LIVE with the parkour gym's NAME, the Bronx as its
borough (the WCS-HQ contamination again), prospectparkzoo.com as its website, and zoo-page chrome
("Get Tickets…") as its description — a token-match fusion of two entities that were never the same
thing. Corrected in place from the gym's own site instead of duplicating. **A minted `-2` suffix is a
collision report, not a name disambiguator — investigate before applying.**

Coverage after: **428 sport listings, 420 served** (started the day at 391); Manhattan zeros 20 → 16,
Brooklyn zeros 14 → 12.

## v186 — shared-venue tenants, four owner spreadsheets, DOHMH camps, and a real guard bug found and fixed

Continued the sovereign loop per owner directive ("stop waiting for DOHMH and continue"). This entry
covers a long stretch: the Major Owens Center tenant expansion, four more owner-verified spreadsheets
(Tribeca-20, SoHo/Little Italy/Hudson Square, Greenwich Village, West Village), the first sport-filtered
pull from the DOHMH camp census, and a real bug fixed in production code.

### Major Owens Center — the shared-venue tenant pattern, exercised for real

Confirmed via the building's own tenant page: New Heights (basketball, Suite 2B), Asphalt Green (turf
field), and — via SerpAPI, since the operator's own site wouldn't yield contact detail — Globall Sports
Centers. All three needed a DISTINGUISHING address element (Suite 2B / Turf Field / Carey Gabay
Recreation Center) to pass the street-address collision guard, which is the guard's error message
working exactly as designed: "a different business in the same building... needs a distinguishing
address (suite, floor, pier)." Also found and fixed: the LIVE Imagine Swimming record at this address
carried ZIP 11216 instead of 11225 — simply wrong, corrected. Determined the real neighbourhood (Crown
Heights, not Prospect Lefferts Gardens) by checking which side of the Empire Blvd boundary the
building's own coordinates fall on, per the method established for World Martial Arts Center earlier
this session.

### Four more owner spreadsheets — the dance/arts filter, applied consistently

Each spreadsheet mixed sport and non-sport activities; dance, ballet and theater rows were excluded from
every one, consistent with the current sport-listings mandate:

- **Tribeca-20**: 5 sport creates (Combat Club by KMI, ARC Athletics, Children's Tumbling, Cocoon
  Tribeca, Ken-Zen Institute). Church Street Boxing Park Place was on the sheet but already live —
  dropped rather than duplicated. **Ken-Zen Institute needed the unevidenced-children's-claim check**
  (the 47 BJJ Coop trap): its main pages mention no youth program at all, and only the membership DUES
  page settles it, pricing minors under 18 separately from adults — created on that evidence, not the
  sheet's assertion.
- **SoHo/Little Italy/Hudson Square**: 4 sport creates (KidStrong SoHo, Martial Arts Family Studio,
  Creative Arts & Sports, United East Athletics Association — a genuine 1976-founded youth sports
  nonprofit). This batch is what surfaced the Centre Street bug (below).
- **Greenwich Village**: 1 create (Mushin MMA) and one real ENRICHMENT — International Martial Arts
  Center's stored address was the PLACEHOLDER "Kips Bay, Manhattan, NYC" (part of the 288-record cohort
  already documented), and the sheet supplied the real one, confirmed on the operator's own page: 98 3rd
  Ave, 2nd Floor.
- **West Village**: found a live address CONFLICT rather than creating anything. The sheet's "Aikido of
  Manhattan, 150 W 26th St" does not match independent search, which places the real Aikido of Manhattan
  at 60 W 39th St and a DIFFERENT school (Aikido Kokikai) at 250 W 26th St — neither matches the sheet's
  address. Not created; recorded as genuinely ambiguous rather than guessed at.

### DOHMH camp census, sport-filtered for the first time

Filtered the 341-site census by name for sport keywords, cross-checked against the pool: 16 of 26
sport-named sites were not obviously duplicates. Working a first batch of 5 surfaced the dedupe
weakness already known from the ranked sweep queue — 3 of 5 (Coney Island, Chinatown, Bedford-Stuyvesant
YMCA) were already live, caught by the address guard. **Two real finds survived**: Bergen Beach Sports
and Recreation Camp (fills a zero-coverage neighbourhood, hosted at St. Bernard Catholic Academy — the
seasonal-operator-renting-a-school shape already established for Steve & Kate's) and Bay Ridge Summer
Sports and Theatre Camp (Our Lady of Angels). Checking the 3 "duplicates" paid off anyway: Chinatown
YMCA's stored neighbourhood was "Chinatown" while its own address (273 Bowery) is BOWERY, a
zero-coverage neighbourhood — the brand-name-in-a-place-field defect, corrected, closing a zero.

Also confirmed the head-office-number pattern twice more: Coney Island YMCA and Bedford-Stuyvesant YMCA
both had DOHMH-record phone numbers that differ from their own branch pages (a central registration
line in one case, a one-digit variant in the other) — each record's OWN branch number was used, not the
census record's.

### The real bug: "Centre Street" tripped the British-spelling guard

United East Athletics Association's own description — "has run youth sports on Centre Street since
1976" — was rejected by `britishSpellingError` for the word "Centre". **Centre Street in Manhattan (ZIP
10013) is the real, official spelling of a real NYC street**, the identical false-positive shape already
solved for a capitalised "Theatre." Fixed in `src/lib/validation/copyQuality.ts`: a capitalised "Centre"
immediately followed by "Street"/"St" is now exempt, narrowly — a capitalised "Centre" anywhere else
still flags. Three new test cases added (two exemption cases, one confirming the exemption stays narrow
by still flagging a bare "the Centre"). Committed, pushed, and the fix had to actually deploy before the
blocked write would go through — a reminder that this bridge's writes run against the DEPLOYED code, not
the local file, so a guard fix isn't done until it's live.

### Registry: CourseHorse added

Owner-suggested. Same shape as Yelp/Sawyer: bot-walled to curl (403), reachable via domain-scoped
WebSearch. A class marketplace rather than a business directory — results name both the operator and the
specific class, so the entity check against the operator's own site stays mandatory.

Coverage after this stretch: **444 sport listings, 436 served** (started this stretch at 428/420).
Manhattan zeros 16 → 14 (Bowery closed via the Chinatown YMCA correction). One batch (SoHo) was dry-run
successfully but not applied until caught on the next status check — worth naming: **a successful
dry-run is not a completed batch until `--apply` actually runs**, and the loop should check for that
explicitly rather than assuming a passed dry-run was followed through.

## v187 — DOHMH camp census, second batch: a three-site name resolution before creating anything

Continued the census pull. `JCC BROOKLYN` (309 Grand Ave) looked like it might duplicate the already-
verified `JCC BROOKLYN WINDSOR TERRACE` (1224 Prospect Ave) — same brand, two DOHMH line items. Checked
before assuming either way: the Windsor Terrace site's own page names all three of the network's
physical locations (Windsor Terrace, North Williamsburg, Clinton Hill) with per-site phone and email.
309 Grand Ave is Clinton Hill — a third, genuinely distinct site, not a duplicate. The Williamsburg site
already has a program card (Williamsburg Soccer Club, 14 Hope St), so only the two venues with no card
were created: JCC Brooklyn Windsor Terrace and JCC Brooklyn Clinton Hill.

Dodge YMCA at PS 261 hit the address guard on first try — 314 Pacific Street already holds `Kids in the
Game PS 261`, a DIFFERENT operator's program card at the same public-school building. Both are real:
Dodge YMCA's own branch page and independent camp directories confirm a genuine satellite camp at this
address, separate from its main branch 8 blocks away at 225 Atlantic Ave. Added a distinguishing suffix
("PS 261 Summer Camp Site") per the guard's own suggested pattern and created it — a second shared-venue
building found this session, after Major Owens.

Coverage: **447 sport listings, 439 served.**

## v188 — Murray Hill filled, a resolved satellite-name ambiguity, five owner spreadsheets, and a live e-commerce contamination quarantined on owner report

Continued the loop after v186/v187. This entry covers Gymboree (DOHMH census, closed), a fresh
zero-coverage SerpAPI sweep of Murray Hill, and five owner-verified spreadsheets (Chinatown/Two Bridges
x2 batches, Lower East Side), plus a live contamination case the owner personally reported.

### Gymboree: 2 of 3 created, 1 correctly refused as closed

The DOHMH census named three Gymboree sites. SerpAPI's structured data confirmed Upper West Side (120
Riverside Blvd) and Upper East Side (1622 1st Ave) as live, both created. The third, DOHMH's "Gymboree
Play & Music of Manhattan" at 235 E 38th St, was NOT created: SerpAPI shows a "Gymboree Play & Music,
Murray Hill" at 236 E 31st St — a few blocks away — marked **permanently closed**, sharing the exact
phone number as the still-open UES site. **This is the second time this session the DOHMH census needed
a currency check before acting on it** (after the Coney Island/Bedford-Stuyvesant number discrepancies) —
the census records registration history, not current operating status.

### Murray Hill filled via a fresh SerpAPI sweep

NYC Martial Arts Center (trading as Professional Tae Kwon Do), 553 2nd Ave, established 1985 — found by
running SerpAPI's structured search directly over Murray Hill's centroid (having exhausted the DOHMH
list), then verified via the operator's actual site once a plausible-but-wrong domain
(professionaltaekwondo.com, unreachable) was ruled out. Filled a zero.

### Chinatown/Two Bridges — 9 creates across two batches, and the Beacon ambiguity resolved

A 12-row owner spreadsheet, worked in two batches of 5 and 4 (one dropped as already-live, Basketball
City). Two things worth keeping:

- **Resolved an ambiguity flagged earlier in this same stretch.** The DOHMH census listed "CHINATOWN YMCA
  BEACON SATELLITE @ TWO BRIDGES" at 286 South Street; SerpAPI's structured search had returned "Beacon
  Center at MS 131" at 100 Hester Street instead — two different addresses under similar names, not
  created at the time. This spreadsheet independently confirmed BOTH as real, separate sites: the Beacon
  Center is genuinely at 100 Hester St (MS 131), and 286 South Street is a THIRD Chinatown YMCA site,
  Cornerstone at Two Bridges Community Center — not a duplicate of either. All three Chinatown YMCA
  physical sites (Bowery, Beacon/Hester, Cornerstone/South St) are now distinct listings.
- **Ten Tigers Kung Fu Chinatown is a satellite class of an out-of-borough business**, and its own website
  (ten-tigers.com) describes ONLY its Huntington Station, Long Island location — no NYC mention anywhere
  on the site. Independent search confirmed the weekly Chinatown class (Sundays, Yoga Art Oasis, 191
  Canal St) separately. Created with the provenance stated plainly: the operator's own site does not
  evidence this location at all, only independent corroboration does.
- Caught and discarded a **template placeholder** left live on Champions Martial Arts Chinatown's own
  page: phone `555-555-5555` and email `mymail@mailservice.com` sitting beside the real, location-specific
  contact details on the same page.

### Lower East Side — 4 of 9 sport-qualifying rows created

A dense 11-row spreadsheet; dance-only rows (Taylor Dance East, Abrons' dance/movement offering) excluded
per the sport-listings mandate, 7 of the remaining 9 already live. Created Workshop NYC (youth Jiu-Jitsu
and Muay Thai, confirmed via a dedicated /youth page), Henry Street Settlement Athletics (one of a
century-old settlement house's several buildings — checked against its own "Our Buildings" list rather
than assumed), New York Rockits, and Capoeira Guatambu.

### A live e-commerce contamination, reported by the owner and quarantined on sight

The owner flagged `prov-lax-com-youth-848d425e` directly. Investigation: "Lax.com Youth," categorised as
a Camp teaching Lacrosse at 350 E 72nd St, was sourced to **lax.com — an online lacrosse EQUIPMENT
RETAILER** ("One Stop Shop for Lacrosse": sticks, heads, gloves, apparel), headquartered in Norwalk, CT,
with ten sister retail stores across four states, none within miles of this Manhattan address. No
evidence anywhere that lax.com runs youth camps at all. Quarantined per the children's-safety-first
directive — the categorically prohibited e-commerce/shopping-platform shape, same tier as the toy
manufacturer's checkout-page case already in this document. **A pool-wide scan for sibling instances
(other listings sourced to sporting-goods retail domains) found none** — a real negative result, not
assumed.

Coverage after this stretch: **461 sport listings, 453 served** (started the stretch at 444/436).
Manhattan zeros 14 → 12.

### Chelsea/Hudson Yards + East Village — 7 of 19 sport-qualifying rows created (2026-08-09)

Owner uploaded three spreadsheets in one message: Chelsea/Hudson Yards (7 rows), East Village (12 rows),
and a second copy of the already-processed Lower East Side sheet (identical content, no new work). Per
the owner's explicit "Stop the loop now" instruction given earlier the same session, this was worked as a
**bounded task** — read, cross-check, verify, create — with no resumption of open-ended autonomous
discovery (no new SerpAPI/Yelp/DOHMH sweeps) once it closed out.

Excluded per the sport-listings mandate (dance/arts, not sports): Tutu School Chelsea, Genius Gems Chelsea
(a magnetic-tile play attraction — a real, fun, physical activity, but not a sport), Peridance Center,
Loco-Motion Dance Theatre, New York Theatre Ballet School.

Excluded on the standing "citywide operator, no venue of its own" caution: **both** Kids in the Game
camps (Chelsea and East Village) run inside Avenues The World School, 259 10th Ave — a private school
building the operator does not own, the same shape already flagged for Kids in the Game at PS 261.
Creating more such cards compounds an unresolved question rather than resolving it.

Deferred, not excluded: Greenwich House Youth Services' two after-school sites are program cards inside
PS buildings the organisation does not own — held pending the broader Greenwich House / program-not-a-
location review already underway elsewhere in this catalog, rather than ruled on in isolation here.

**Distinguished two similar-looking "operator rents a school building" shapes side by side, deliberately
opposite outcomes**: LNF Kids Summer Camp (215 E 6th St, St. George Academy) is a dedicated, single-
purpose seasonal camp business whose rented building IS its real and only location — created, matching
the already-established Steve & Kate's Camp precedent. Kids in the Game (above) is a multi-site citywide
operator with no venue of its own anywhere — not created, matching the PS 261 precedent. Same building
shape, opposite verdict, because the question is whether the operator has ANY venue of its own, not
whether this particular venue is rented.

**A second live template-placeholder finding on championstkd.com** (first found earlier this session on
the Chinatown location): the Chelsea location page also serves `555-555-5555` / `mymail@mailservice.com`
beside its real, location-specific contact details. Confirms this is a site-wide template default, not a
one-off — worth checking any further Champions TKD location before trusting its contact block wholesale.

**Mu Geuk Martial Arts — spreadsheet URL was a dead franchise-directory template.** The sheet's given
`mugeukmartialarts.com` resolved to an inactive template page with no real content. Independent search
found the operator's real, active site at `mugeuknyc.com` (271 W 23rd St, 2nd Floor) — created sourced to
the real site, not the spreadsheet's dead one. Same entity-before-domain discipline already applied to the
lax.com case, run in the opposite direction: here the entity is real and the given domain was simply wrong.

**Cornerstone at Campos Plaza University Settlement** (611 E 13th St) — the operator's own program page
described the drop-in basketball activity but did not print a street address for this specific site;
address confirmed via independent search rather than assumed from the organisation's other locations.

**The Rainbow Play Space — address corrected from the spreadsheet.** The sheet claimed 14 E 7th St; the
operator's own site (homepage and a separate contact page) consistently gives 343 East 10th Street.
Unlike the West Village sheet's Aikido of Manhattan candidate earlier this session (where independent
search produced a *different, ambiguous* address with no clear resolution and the candidate was withheld
entirely), here the operator's own site gave one clear, repeated answer — so the record was created at the
operator-confirmed address, with the spreadsheet's discrepant address noted in `fieldVerifications` rather
than either trusted blindly or used as a reason to withhold.

Created (7): Champions Martial Arts Chelsea (241 9th Ave), Mu Geuk Martial Arts (271 W 23rd St, 2nd Fl),
Ahn's Taekwondo NYC (20 Avenue A), Champions Martial Arts Avenue C (177 Loisaida Ave), LNF Kids Summer
Camp (215 E 6th St), Cornerstone at Campos Plaza University Settlement (611 E 13th St), The Rainbow Play
Space (343 East 10th St). All 7 applied cleanly, gate PASSES, zero collisions.

Coverage after this batch: **461 sport listings in Brooklyn+Manhattan, 461 served** (469 in the database,
8 built-but-not-yet-served elsewhere in the pool). Per the owner's stop instruction, autonomous discovery
is paused here pending further direction — this entry closes out the bounded spreadsheet-processing task,
not a loop iteration.

### Hell's Kitchen + Midtown South/Flatiron/Union Square — 4 creates + 1 in-place correction (2026-08-09)

Owner uploaded four spreadsheets in one message: Chelsea/Hudson Yards and East Village were BYTE-IDENTICAL
to the ones fully processed in the batch immediately above — no new work there. Hell's Kitchen (8 rows)
and Midtown South/Flatiron/Union Square (8 rows) were genuinely new. Worked as the same kind of bounded
task as the prior batch, per the owner's earlier "Stop the loop now" instruction (still in force, not
rescinded by these uploads).

Excluded (dance/theatre, not sport): Broadway Dance Center (also already live at a different, correct
address — Lincoln Square), The Ailey School Junior Division, Center for Performing Arts and Dance
(CPAD NYC — "rhythmic gymnastics" is one item on an otherwise dance-dominant menu, the same
dance-dominant-menu judgment already applied elsewhere), TADA! Youth Theater (already live), KidHop.

Excluded on insufficient sport-specificity, not on the reality check: **Hartley House** (413 W 46th St) is
a confirmed real, physically-located organization with a genuine after-school and summer camp program —
but its own site names no specific sport, only "youth recreation," and JS-rendered program subpages didn't
resolve anything more specific to a static fetch. Not the same as a reality-check failure; simply doesn't
clear the sport-specificity bar this queue is filtering for. **Union Square Play** (67 E 11th St — a real,
different physical location from the already-live Upper East Side branch) excluded for the identical
reason: "child-led physical play" and yoga are not in this catalogue's sport vocabulary.

Already live, no duplicate created: New York Ninja Academy Manhattan (625 W 55th St, exact address match),
Karate-Do Ken Wa Kan (34 W 15th St, exact address match), and **Karate City** (525A W 52nd St) — confirmed
still correctly live as `prov-karate-city-uws`, with its fabricated "Upper East Side" twin still correctly
`visibility: hidden` from an earlier session's retirement. Worth recording as a small confirmation that a
prior correction held.

**Tiger Schulmann's Martial Arts – Chelsea/Flatiron (688 6th Ave) surfaced a live defect, not a new
create.** The sheet named this location, and an existing live record (`prov-tiger-schulmann-s-chelsea`)
already covered the business — but with a borough-level placeholder address ("Chelsea, Manhattan, NYC")
AND `activityTypes: ["Art", "Music"]` on a martial arts school, the exact substring-match failure mode
this catalogue has already named ("Art" hides inside "m**Art**ial"). Independently fetched
`tsk.com/locations/ny/chelsea/`, confirmed the real address (688 Ave. of the Americas = 688 6th Ave,
10010) and the school's real activity, and corrected both fields **in place** via `/update` rather than
creating a duplicate. A reminder that verifying a spreadsheet row against a live pool match is itself a
chance to catch an existing defect, not just a dedupe check.

Created (4): Nicol NYC – Hell's Kitchen (Classes, Squash — address taken on the spreadsheet's own
verification since the operator's site renders its address via JavaScript and a static fetch could only
confirm the entity/neighborhood/Junior program, not the street number), Manhattan Plaza Health Club
(Classes, Swimming+Climbing, 482 W 43rd St — both the learn-to-swim and kids-climbing programs confirmed
directly off the operator's own navigation menu), Renshin-Kai Karate – Matsumoto Dojo (Classes, Karate,
754 9th Ave — the operator's own homepage says outright "our dojo in Hell's Kitchen," an unusually direct
self-confirmation), Yang Taekwondo (Classes, Taekwondo, 39 E 30th St — neighborhood **corrected** from the
spreadsheet's coarse "Midtown South/Flatiron/Union Square" batch label to "Rose Hill," the real, specific
micro-neighborhood a Nominatim reverse-geocode of the exact address returns and which is already in this
platform's own NYC neighborhood vocabulary; stored per the "store the real name" directive rather than the
coarser label the sheet itself used).

Coverage after this batch: **465 sport listings served in Brooklyn+Manhattan** (461 → 465), plus one
existing live record corrected in place. Per the owner's stop instruction, autonomous discovery
(SerpAPI/Yelp/DOHMH sweeps) remains paused — this entry closes out another bounded spreadsheet task.

### Midtown-Times Square + Stuyvesant Town/Peter Cooper Village — zero new creates, two real defects found and fixed, one new access-restriction pattern named (2026-08-09)

Two more spreadsheets, same bounded-task discipline. Neither produced a net-new create — both nonetheless
paid for the research time.

**Midtown-Times Square (8 rows).** Excluded (dance/theatre): Brickhouse NYC, Broadway Dance Center –
Times Square (also a duplicate address question — see below), Martha Graham School, Open Jar Institute,
Times Square Alliance TSQ LIVE Dance, Ailey Extension TSQ LIVE. Excluded on the **administrative-office
pattern already named in this doc**: Juventus Academy New York's given address (1345 6th Ave, 33rd Floor)
is a corporate/franchise office suite, not a training field — the operator's own page describes its
methodology at length but names no specific NYC training venue. Real, legitimate, and probably belongs in
this catalogue eventually, but not at this address; left unresolved rather than guessed.

**Fencers Club (20 W 33rd St) surfaced a real duplicate-with-stale-address, the same shape already
catalogued for Tiger Schulmann's UES/UES and Karate City.** The sheet's address matched an existing live
record (`prov-fencers-club-9f071a34`) exactly, but that record had an EMPTY neighborhood — filled in as
Koreatown via a Nominatim reverse-geocode of the exact address (the Fifth Ave–Broadway corridor around W
32nd–36th St, already in this platform's vocabulary). A **second** live record, `prov-fencers-club-youth-
programs`, named the same club with the same phone/email/website/age-ranges/activityTypes but a DIFFERENT,
STALE address (229 West 28th Street) — the club's own contact page states plainly "Fencers Club is located
at 20 West 33rd Street, Level 2," with no mention of a second location. Retired the stale-address twin
(`visibility: hidden`) rather than correcting its address to match its sibling, which would only have
produced a true duplicate. Net effect: zero new cards, one existing record enriched, one stale duplicate
retired.

**Stuyvesant Town/Peter Cooper Village (11 rows) — a new pattern, deliberately NOT created from.** Every
row but one is sourced to `stuytown.com/amenities/our-80-acres/stuytown-sports-and-camps` — a PROPERTY
MANAGEMENT company's own leasing/marketing page ("Find your home... Amenities... Sign in as an
Applicant... Resident Portal"), not an activity provider's own site. Checking the flagship listing
(Amazing Athletes' StuyTown camp) directly on the OPERATOR's own page (not the property's) found it says,
verbatim: **"Amazing Athletes Sports & STEAM Camps offers an incredible fun and memorable camp experience
for StuyTown residents."** That is a private residential complex's own amenity, restricted to its own
tenants — not a program any NYC family could show up and enroll in, the same underlying harm the
no-fixed-venue and administrative-office rules exist to prevent (a card that reads as an open public
option but isn't one), arrived at by a new route. The remaining vendor rows (FFA Soccer, Huddle Up Flag
Football, Super Soccer Stars, Karate by KP, Amazing Athletes Fitness Classes, StuyTown Junior Golf, Oval
Kids) share the identical sourcing (the same property-management "amenities" page, no independent
confirmation either way of general-public access) and were **deliberately left uncreated as a group**
rather than resolved individually under time pressure — this is a `needs_human` escalation, not a reality-
check failure: the businesses themselves may be entirely real and legitimate, the open question is
specifically whether an outside family can actually enroll. **NYC Volleyballers is the one row that reads
differently** — its own independent site (not stuytown.com) lists StuyTown as one of THREE locations
alongside Kips Bay (UNIS) and the Upper East Side (92Y), which looks more like a citywide multi-site
youth-sports operator renting space across several venues than a residents-only amenity — but its
StuyTown-specific page did not resolve to confirm public registration either way in the time available, so
it was left uncreated alongside the rest rather than guessed in either direction. **Recommendation for a
future pass**: contact or directly test registration flow for NYC Volleyballers' StuyTown program and for
one or two of the stuytown.com-listed vendors, to establish a general rule for this shape (private
residential complex hosting third-party children's activity vendors) rather than resolving it row by row
each time it recurs — StuyTown/PCV is an 80-acre, ~25,000-resident complex, so this shape will likely
recur at other large NYC residential developments.

No new creates from either sheet. Two real live-record defects corrected. One new pattern named and
deliberately left as an open recommendation rather than forced either way.

### Resumed general sovereign maintenance loop — defect-signal batch #1 (2026-08-09)

Owner said "Continue the process" with no spreadsheet attached, reopening the general loop (the earlier
"Stop the loop now" had paused it; this instruction resumes it). `updatedAt` is useless as a queue (a full
session's own sweeps touched most of the pool already), so the batch was chosen from `signals.py`'s
worst-first defect-signal ordering across the 405 live providers not yet touched this session. Six
corrected in place, two quarantined — full component review on each, not a single-field sweep.

**Sloomoo Institute NYC** — reality check passed (currently ticketing live visits), but its own nav badge
("New York Institute Coming soon NEW!") looked at first glance like the pre-opening-location pattern
already named in this doc (Goldfish Swim School UWS). Checking the location's OWN dedicated page rather
than trusting the nav badge showed it was already open and selling tickets — the badge is decorative site
chrome, not a status indicator. Real address found (475 Broadway, SoHo). Its description was scraped
customer-review quotes verbatim ("Paul J", "Angela R", "Kohl H") — a name-attributed-testimonial variant
of the already-catalogued scraped-chrome defect, rewritten as real copy. Category corrected `Classes` →
`Drop-In Activities`: a timed-entry ticketed walk-in experience has no curriculum to enroll in.

**SFX Youth Sports Flag Football** and **US Sports Institute Washington Heights** both turned out to be
the already-named "league/program plays on public fields" shape (Brooklyn AYSO/Gjøa precedent) — SFX's own
page states outright it's "the only Flag Football league that plays in Prospect Park," so the address was
set to the real park rather than left as a bare borough placeholder; US Sports Institute's own program page
confirmed classes run across UNNAMED neighborhood parks with no single venue, so its neighborhood-grade
address was correctly left alone rather than forced into a fabricated street. Both had identical short/long
generic filler descriptions, replaced with the real program menus from each operator's own page.

**Taro's Origami Studio Kids — wrong neighborhood, not wrong borough**, a variant of the address-beats-name
pattern already in this doc. Its own contact page names its Brooklyn studio as "Japan Village 2nd Floor
'The Loft', 934 3rd Ave, Brooklyn, NY 11232, Industry City, Building 4" — Industry City is in **Sunset
Park**, not the previously-stored Park Slope. Phone and email added from the same page. (The same page also
surfaced the company's Philadelphia HQ and a Tokyo studio — HQ address correctly NOT used, per the
already-catalogued parent-HQ-address failure mode.)

**Take Me to the Water Upper East Side** — this specific record's own `sourceUrls` array already named the
exact venue (`/hunter-college`), which the operator's JS-rendered page didn't yield to a static fetch; the
well-established public address of Hunter College's own main campus was used instead of guessing. Its
description was a dangling sentence fragment beginning "Their classes..." with no antecedent — a scrape
that started mid-sentence, rewritten as complete copy.

**Taste Buds Kitchen Brooklyn — a fourth confirmed real-brand-wrong-location case, resolved by the
exactly-one-real-answer rule.** The operator's own current location directory lists exactly one NYC-proper
site ("New York City – Chelsea") and its only other NY-area location is Long Island–Smithtown — **no
Brooklyn location exists in the current list at all.** Since exactly one real NYC-proper answer exists (not
zero, not several), corrected rather than quarantined: renamed, re-bordered Brooklyn→Manhattan, address set
to the operator's own Chelsea page (109 W 27th St, 10th Fl), phone added. `activityTypes` also corrected
from `["Art"]` (a token-match artifact on a cooking studio) to the real, vocabulary-recognized `"Cooking"`.

**Two quarantines, both reality-check failures found by actually reading the source, not by any field-level
tell.** *UWS & Midtown NYC Family Events* is sourced to kiddosinthecity.com, whose own homepage describes
itself as "your local guide to family events... curated by a local mom" — a blog/newsletter aggregating
OTHER businesses' events, the identical structural shape already named for Psychology Today's own
category-search page and letsgobaby.co: the card names no single business because its source never named
one. *Prep Academy Tutors Manhattan* is a real, legitimate tutoring company whose own site describes
exclusively "Flexible, in-home & online tutoring" — the categorically prohibited no-fixed-venue shape
(a network of independent tutors traveling to a family's home, no studio of the business's own), distinct
from the hybrid real-venue-plus-online case this catalogue keeps rather than quarantines.

Retrospective: two of six corrections in this batch (SFX, US Sports Institute) came from the SAME
underlying shape (park-based programs, no owned venue) recognized on sight because it was already named
from the AYSO/Gjøa work — a concrete case of a documented pattern paying for itself immediately on reuse,
not just as a reference. Net: 6 corrected, 2 quarantined, 0 left unresolved. `batch_done.json` (now 636
IDs) updated so the next pass doesn't re-serve any of these.

### Gramercy (boundary-audit sheet) + Murray Hill–Kips Bay — 1 create, 4 real defects fixed via a chain-wide sibling check (2026-08-09)

The Gramercy sheet's own filename ("HARVEST_with_boundary_audit") signaled its purpose, and it bore out:
most of its 12 rows describe real businesses that are NOT actually in Gramercy. Cross-checking each
against the pool surfaced more value than the sheet's own target neighborhood did.

**Tiger Strong NYC's sheet-given address (22 E 14th St, Union Square) is stale/wrong.** The operator's own
current site says "Karate Near Me on the **Upper East Side**" at 1521 York Ave — exactly matching the
address already on the existing live record. Not a Gramercy business at all; confirms the existing record
was already correct and the sheet's claim should not be trusted here.

**NY Kids Club — a chain-wide Art/Music defect found by checking ONE branch against its siblings.**
The sheet's "NY Kids Club – Gramercy" (38 E 22nd St) matched an existing live record exactly, which turned
up two defects: `neighborhood: "Midtown"` (38 E 22nd St is nowhere near Midtown; Nominatim resolves it to
Flatiron) and `activityTypes: ["Art","Music"]`. Checking this against the OTHER 6 NY Kids Club branches
already in the catalogue found 4 correctly carry `["Gymnastics","Sports"]` (matching the chain's real core
programming) and **2 more — 68th Street and Cobble Hill — carry the identical wrong `["Art","Music"]`**.
All 3 corrected to match the chain's own consistently-populated branches, without needing to fetch any of
their pages directly — the pool itself, once one branch's defect was known, was the source of the fix for
the other two. **Kids at Work Incorporated** had a bare Chelsea-borough placeholder address, filled in from
this sheet's specific street address (123 W 20th St, Suite 2E), consistent with the sheet's own
verification note calling it "Chelsea/Gramercy-adjacent."

**One new create: British Swim School – The Continental (885 6th Ave, Chelsea).** The operator's own
location page 403s to every user-agent tried (bot-walled) — rather than skip it, the address was
independently confirmed via Nominatim, which resolves a real building ("Tower 111"/The Continental) at
that exact address in the Chelsea District. A case where the entity-confirmation discipline doesn't
require the operator's OWN page specifically — an independent, authoritative geocode of a national
franchise's stated address is enough when the page itself is unreachable.

Excluded (dance/theatre, insufficient sport-specificity, or already live): Midtown Movement and Dance
Company, Wee Ones Club (yoga/movement, not in the sport vocabulary), NYC School of Highland Dance, the
duplicate "Wee Ones/Midtown Movement hosted programme" row. **St. Vartan Park youth sports** was excluded
on a new, narrow ground: the sheet itself frames it as "a facility/programme-location record, not a
private provider" — a bare NYC Parks facility with no specific identified program or operator is not
itself a card-worthy provider in this schema (distinct from the SFX/Prospect Park and AYSO/Parade Ground
precedents, where a SPECIFIC named program plays at a park; here no specific program was named).

**Murray Hill–Kips Bay (8 rows) needed zero creates and zero fixes** — every real, in-scope candidate
(Professional Martial Arts Taekwondo Center, matching the already-live NYC Martial Arts Center Murray Hill
at the identical 553 2nd Ave address; Asser Levy Recreation Center; Yang Taekwondo, created in the earlier
Hell's Kitchen/Midtown South batch) was already correctly represented in the pool, and both already-live
records checked out clean on a full field read (name, address, activityTypes, neighborhood, description).
A real negative result — worth recording precisely because most batches this session have found something.

Coverage: **466 sport listings served in Brooklyn+Manhattan** (465 → 466). `batch_done.json` grows with
each pass; autonomous discovery (SerpAPI/Yelp/DOHMH) remains untouched this session — every fix and create
in this stretch came from spreadsheet cross-checks and pool-internal sibling comparisons.

### Sutton Place–Midtown East + UES-Lenox Hill-Roosevelt Island + Carnegie Hill — 12 creates, 4 real defects fixed (2026-08-09)

Three spreadsheets with heavy mutual overlap (Ace Martial Arts, Modern Martial Arts, SwimJim, Gotham City
Swim, NYC Elite Gymnastics, Supreme Martial Arts and Yorkville Tennis Club all appear on 2 of the 3 sheets
at identical addresses) — cross-checked once per business, not once per sheet.

**Two genuinely separate real locations of national chains, correctly distinguished from earlier
resolved duplicate clusters rather than re-litigated.** Penguin City Swim already has a card correctly
resolved to Riverdale, the Bronx, after 8 earlier duplicate cards wrongly guessed Manhattan/Brooklyn for
what turned out to be one pool — the standing risk was repeating that exact mistake. Checked first: the
operator's own site lists FOUR distinct location categories (Upper West Side, Midtown East, Riverdale,
Upper East Side), so "Penguin City Swim – Midtown East" at 132 E 45th St is a genuinely separate real
location, not a re-guess of the Riverdale pool — created. Same discipline for My Gym: two branches
("Upper East 60th" and "Upper East 83rd") both created as distinct, since the operator's own site names
them as separate locations, not one business guessed twice.

**SwimJim Upper East Side had a wrong address that matched NEITHER of the operator's two real UES
locations.** The stored address (1113 York Ave) doesn't correspond to either "Two Sutton Place North" or
"The Yorkshire Towers" (305 E 86th St) — SwimJim's own locations page names exactly these two current UES
branches. Corrected to the Yorkshire Towers address this batch's spreadsheet independently confirmed. The
Two Sutton Place North branch remains uncarded — its exact street number wasn't found — recorded as an
open gap rather than guessed. **Gotham City Swim School, created at the same 305 E 86th St address**, is a
second, distinct swim-school operator sharing that building's pool — a shared-venue-tenant case, the same
shape as Chelsea Piers and Major Owens Center.

**Modern Martial Arts Tribeca — two live duplicate records, and the "richer" one had the stale phone.**
Both at 78 Reade St; one had a complete, real description and a branch-specific email but a phone
(212-772-3700) that independently re-fetching mmanewyorkcity.com/tribeca showed is stale; the other had a
scraped description cut off mid-sentence ("...They grow not only in martial arts, but") but the CURRENT
real phone (212-587-1099). Kept the better-written record, corrected its phone from the other, retired the
truncated-description twin — a reminder that "which twin is richer" and "which twin is right" can point at
different records on different fields, so check both before picking a survivor.

**Shared-venue-tenant case at the Sutton Place Family Center (225 E 51st St)**: Kids in Sports and Sutton
Place Synagogue's own summer camp both operate in the same building — created both, with a `Suite SPS`
address marker on the second per this bridge's own collision-guard convention, rather than merging two
distinct real organizations into one card.

Excluded: Above the Notes (dance/collaborative-arts), Juliette & Ella's Play Date (music/movement, not in
the sport vocabulary), Kids in the Game Summer Camp – Carnegie Hill (the same "no venue of its own"
citywide-operator caution excluded twice already this session), and **Big Apple Youth Sports — a new
instance of that same shape found by reading its own page**: "The Afterschool Sports providers for PS6,
MNS and YCS" states outright it operates inside several private schools, not from a venue of its own.
**Children First Sports** was excluded on insufficient verification, not a reality-check failure — the
spreadsheet itself flagged "lower verification confidence" and independently, `childrenfirstsports.com`
does not even resolve (DNS failure); no live site exists to confirm anything against.

12 created, 4 existing records corrected (3 address/neighborhood fixes, 1 duplicate retired). Coverage:
**480 sport listings served in Brooklyn+Manhattan** (466 → 480).

### Owner-contributed operator URL list folded into the source registry (2026-08-09)

The owner sent the complete list of ~140 operator/venue URLs behind these spreadsheets in one message —
recorded into `docs/source-registry.md` alongside the source-hierarchy principle from the same
conversation (provider official site → official host/venue → municipal/institutional source → structured
local-business discovery → third-party directory as a lead only). Several URLs on that list correspond to
businesses already resolved in this catalogue by a DIFFERENT route earlier in the session (e.g. Karate
City, Fencers Club, Yang Taekwondo, Tiger Strong NYC) — useful confirmation that this owner-curated list
and this bridge's own review loop are converging on the same real businesses independently, not working
at cross purposes.

### General maintenance batch #2 — a B2B staffing vendor quarantined, a duplicate merged, an admin-office address cleared (2026-08-09)

Next defect-signal batch, worked while no spreadsheet was pending. Six records touched.

**Togetherhood Manhattan — a new shape of the no-fixed-venue prohibition.** Every prior instance of this
rule (Prep Academy Tutors, Kids in the Game, Big Apple Youth Sports) was a vendor whose people travel to
OTHER buildings — a family's home, a rented school. Togetherhood is one more step removed: it's a **B2B
staffing platform** whose own homepage says outright, "Togetherhood connects schools with passionate,
vetted independent instructors" — the schools are Togetherhood's customers, not the families, and the
stored address (530 5th Ave) is its own corporate office. A family can't sign up with Togetherhood
directly at all; whatever school licenses its instructors is the actual point of contact. Quarantined on
the same reasoning as the others, one layer more abstracted from the venue.

**Henry Street Athletics — a duplicate pair, each with what the other lacked.** One record
(`prov-henry-street-settlement-athletics`, created in an earlier LES batch) had the real address (301
Henry St, confirmed off the operator's own "Our Buildings" list) but no email and only `Basketball` in
`activityTypes`. The other (`prov-henry-street-athletics-a739082a`) had a placeholder address but a
specific staff phone and email (`sjeambon@henrystreet.org`) and a description naming BOTH basketball and
baseball training. Merged the good fields into the canonical (address-correct) record — added the
phone/email, added `Baseball` to `activityTypes` — then retired the duplicate. A reminder that a duplicate
pair is sometimes worth reading in full before picking a winner: neither record alone had everything.

**Rangers Youth Hockey — an administrative-office address cleared, not corrected.** The stored address (11
Penn Plaza) is Madison Square Garden's own corporate headquarters; the Rangers' community page names no
specific rink where youth camps/clinics actually run. Rather than guess a rink, the address was cleared —
consistent with the standing rule that a wrong address is worse than an honest gap, applied here to a
professional sports team's community program rather than a tutoring company or NYC Parks facility.

**Bed-Stuy Sluggers Baseball League's description was a coach-bio fragment** ("In addition to his team
coaching, he has extensive experience...") starting mid-sentence with no antecedent — rewritten with the
organization's own real facts (a volunteer-led 501(c)(3), founded 2014, serving Bedford-Stuyvesant and
central Brooklyn). No specific street address was found on the operator's own site (the league plays at
various Brooklyn fields), so the neighborhood-grade address was left as the honest answer rather than
invented — the same park-league discipline as SFX/AYSO/Gjøa.

**Staten Island Zoo Birthday Parties** had an empty neighborhood field on an otherwise well-populated
record (real address, real pricing, real party details already present from an earlier pass) — filled in
as West Brighton, the zoo's well-established Staten Island neighborhood.

6 touched: 1 quarantined, 1 duplicate merged-and-retired, 1 admin-office address cleared, 2 descriptions
rewritten from fragments, 1 empty field filled. `batch_done.json` now at 663 IDs.

### General maintenance batch #3 — a leaked pipeline note in a NAME field, and an expired marketing site that isn't a closure (2026-08-09/10)

**BronxWorks's own NAME field read "Bronxworks: Missing_official_image"** — an internal pipeline note
about a missing image had leaked into the public-facing name itself, not a description field like every
prior instance of this class of bug. Corrected to "BronxWorks Adolescent Programs." Worth widening any
future leaked-text sweep to check `name`, not just the copy fields.

**NYC Skyline Flag Football's stored website now shows "Squarespace - Website Expired"** — a lapsed
hosting subscription, not obvious evidence of closure. Before treating it as the confirmed-permanently-
closed pattern (City Treehouse), checked independently: the operator still runs an ACTIVE LeagueApps
registration portal (a live member-login page, not a dead one), and a web search still surfaces the
program's own flag-football and basketball pages describing current-looking offerings. Corrected the
stored `website` to the still-live LeagueApps URL rather than the expired one, and flagged the situation
itself (expired marketing site, active registration platform) for a future re-check rather than either
quarantining a possibly-still-real business or leaving a dead link standing. A new, narrower case between
"confirmed closed" and "confirmed open": the business's OWN marketing presence lapsed while its
transactional one didn't.

Three more descriptions were scraped PAGE CHROME rather than real copy, each a slightly different shape
of the pattern already named: Prospect Park Baseball Association League's was a season-farewell banner
plus a live field-status widget's text ("Closed Field is closed for the day n/a No field status
available"); Children's Aid Athletics and Team Sports' was the ORGANIZATION's homepage chrome (donor
testimonials, a fundraising benefit announcement, and an anecdote about a DIFFERENT, Bronx-specific soccer
program) rather than copy about this specific athletics program — the anecdote was real and well-written,
which made it tempting to keep, but it described a different program page and was deliberately left out
rather than imported as if it were about this one. Brooklyn Crescents Lacrosse's description was simply
cut off mid-sentence ("Programming for Every Age From Age 3") — completed from the operator's own site,
which also filled a previously-empty `ageRanges` field (PreK through high school).

**Socceroof Sunset Park's description tail was literally the site's own navigation menu**, scraped
verbatim ("Careers Contact Blog... Our clubs Crown-heights New Rochelle Long Island City Hochelaga Le
Plateau Sunset Park...") — cleaned up, with the specific street address left as a `needs_human` gap since
the operator's site is a JS-rendered Astro app that yields nothing to a static fetch.

Two records in the batch (Oasis Day Camp – Park Slope, Kids in the Game Inwood Summer Camp) were flagged
by the defect-signal scan (`desc_identical` — short and long description are byte-for-byte the same) but
turned out on inspection to already carry real, specific, well-written copy that simply works at both
lengths — not a defect. Left untouched. Worth restating: `desc_identical` is a SIGNAL to check, not proof
of a problem on its own — the earlier "American Youth Dance Theater" case that named this signal really
was generic filler; these two are not.

6 touched (4 description rewrites, 1 leaked-name fix, 1 website correction), 2 checked and confirmed clean.
`batch_done.json` now at 671 IDs.

### General maintenance batch #4 — a fifth split candidate found, five leaked-navigation descriptions cleaned (2026-08-10)

Seven records, all arts/music/STEM providers rather than sport (this loop is not sport-restricted —
that filter only applied to the neighborhood-spreadsheet stream). Five of the seven had a description
that was literally the operator's own site NAVIGATION MENU, scraped verbatim, rather than copy —
Children's Arts & Science Workshops (repeated 3x: "Home - Children's Arts & Science Workshops, Inc.
Children's Arts & Science Workshops, Inc."), New York Transit Museum Education ("Calendar Old City Hall
Tours... LEARN and tour LEARN and tour"), Lavender Blues ("Home Classes Videos About Me Gift Cards
Contact Me Music", repeated 3x), Artshack Brooklyn, and Brooklyn Game Lab (a single generic marketing
line rather than nav chrome, but the same underlying "no real copy" defect). All five replaced with real
facts pulled from elsewhere on each operator's own site — a confirmed founding year for Artshack (2016),
a real program list for Brooklyn Game Lab (D&D leagues, Teen Counselors in Training), CASW's actual DOE
program types (Beacon, Cornerstone, SONYC).

**Muse Arts — a fifth confirmed split candidate, found by checking why a record's neighborhood (Melrose,
Bronx) didn't match its own description (serves "Upper West Side, Upper East Side, Harlem, and the South
Bronx").** The operator's own Locations page names **five real, distinct venues**: Center for Family Music
(102 W 75th St, UWS), Pilgrim Cathedral of Harlem (15 W 126th St), Workplayce (154 W 70th St, UWS), Speech
Matters (1751 2nd Ave, UES), The Brick Church School (62 E 92nd St, UES), and — matching the stored
Bronx/Melrose location — "The Studio at 811 Walton Ave (South Bronx), 810 Gerard Avenue, The Bronx, NY
10451." Fixed this record's address to the specific confirmed Bronx site rather than leaving the bare
neighborhood placeholder, and recorded the other four confirmed addresses in the write's `reason` field as
a split candidate for a future pass — the same discipline already used for Little Scholars, Modern Martial
Arts, and SwimJim: **when a multi-venue operator's addresses are already confirmed, record them before
they're forgotten, even if the split itself waits.**

**Brooklyn Bridge Park Conservancy Environmental Education** had a genuine, well-written description
already — just a DUMBO-borough placeholder address, filled in with the Environmental Education Center's
real building (99 Plymouth St) from the operator's own site navigation.

7 touched — 5 descriptions rewritten from leaked navigation/generic filler, 1 address specified from a
split-candidate operator, 1 address filled from a placeholder. `batch_done.json` now at 678 IDs.

### General maintenance batch #5 — three quarantines, and a fabricated-location read that turned out wrong on a second check (2026-08-10)

**NY Martial Arts Academy looked exactly like the real-brand-fabricated-location pattern, and wasn't.**
This record's own stored description named the chain's locations as "Astoria, Little Neck, Greenpoint,
and Glen Cove" — four real places, none of them Manhattan — while the record itself claimed "Midtown,
Manhattan." Zero of four matching is exactly the shape that has meant quarantine every other time it's
been seen this session. But the description is a stale/incomplete scrape, not the operator's current
truth: fetching nymaa.com's own current Locations page directly shows FIVE branches, not four — Astoria,
Greenpoint, Glen Cove, Little Neck/Bayside, **and Midtown, Manhattan, 787 7th Ave**. The record was real
all along; its own copy just hadn't been updated for a location the business added since. Corrected the
address to the confirmed 787 7th Ave and rewrote the description to reflect all five branches. **The
lesson: when a record's own description contradicts its own location claim, check the operator's CURRENT
site before concluding fabrication — a stale description is a real possibility distinct from a fabricated
address, and this is the first time this session it was the description that was wrong, not the field.**

**Three reality-check failures, each a different flavor already named in this catalog.** *F45 Training* is
a pure adult HIIT franchise — its own homepage text contains zero mentions of children, kids, or youth
anywhere, despite the record carrying `ageRanges` from 0-2 through Teens; more clear-cut than any prior
"unevidenced children's claim" case, since those at least had the word "kids" somewhere on the page. *Yombu
New York* is a real, legitimate booking marketplace for kids' party entertainers — but the entertainers
travel to the CUSTOMER's own party venue, and Yombu itself has no physical location a family ever visits,
the Togetherhood shape applied to entertainers instead of instructors. *Broadway Bound Kids* is off-topic
contamination: its stored description is entirely unrelated scraped Broadway.com content (an actor's bio,
a Disney casting note, a preview schedule for an unrelated play), and searching broadway.com's own
homepage for "Broadway Bound Kids" turns up nothing — the name appears nowhere on the site it was
supposedly sourced from.

Two more descriptions cleaned from leaked navigation/generic filler (Nory Brooklyn Heights, Allergic to
Salad Brooklyn), both left at neighborhood-grade addresses since both operators run at rotating rented
venues or partner sites rather than one fixed studio — an honest gap, not a placeholder to force closed.

9 touched: 3 quarantined, 1 corrected after a second look reversed an initial fabrication read, 2
description cleanups, 3 checked and left as-is (Camp Orot, Metropolitan Oval Academy Manhattan Outreach,
Russian School of Mathematics UES — all already reasonably complete). `batch_done.json` now at 687 IDs.

### General maintenance batch #6 — a quarantine that had been decided but never applied, plus a second leaked page-title NAME bug and two new creates found along the way (2026-08-10)

**Tutu School Williamsburg — the reality check this catalogue's own notes had already run, apparently
without the write landing.** This exact case (Tutu School's Williamsburg card, a real brand claiming a
location its own site doesn't have) is already described in this file's "Hard-won lessons" section as
QUARANTINED — but the live record's `qualityStatus` was still `null`. Re-ran the check from scratch rather
than trusting the note: fetched tutuschool.com/locations directly, and its full current NY roster (Long
Island City, Commack, DUMBO, Tribeca, Sayville, Chelsea, Park Slope, East Amherst, Boerum Hill, Lenox
Hill, Upper East Side) confirms **no Williamsburg branch exists**. Quarantined for real this time. **A
documented decision is not the same as an applied write — worth spot-checking closed items occasionally,
not just trusting the log.**

**That same fetch surfaced two real, uncarded branches: Park Slope (235 5th Ave) and Chelsea (175 10th
Ave)** — both already visible on the operator's own locations page but absent from this catalogue (DUMBO,
Boerum Hill, UES and LIC were already correctly carded). Chelsea had actually been EXCLUDED once already
this session, from the Chelsea/Hudson Yards sport-only spreadsheet batch, correctly, since it's dance —
but this loop isn't sport-restricted, so both were created now.

**"Programs Kids Programs in Kingsbridge Bronx" — a second confirmed instance of a page-`<title>`-tag
leaking into the public NAME field**, the same class of bug as BronxWorks's "Missing_official_image"
earlier this session, but with different content: this one is the page's literal HTML `<title>`, not an
internal pipeline note. The real business, confirmed from its own page text, is **Warriors Sports Club**
— "loved by Bronx families for over 25 years" — operating inside Church of the Mediator at 260 West 231st
Street. Renamed, and address/phone/email/activityTypes (Taekwondo) filled in from the same page. **Two
confirmed instances of this exact bug class in one session is enough to call it a pattern worth a
dedicated scan** (any NAME field containing "Programs" as its first word, or matching a URL-slug shape,
is a plausible signal) rather than waiting to stumble on a third.

**The Whitney Museum Family Programs had an internal contradiction free to catch**: `neighborhood` said
Chelsea while `address` already correctly said Meatpacking District — the same check-a-record-against-
itself discipline already named for Ballet Tech. Corrected the neighborhood to match, and filled in the
real street address (99 Gansevoort St). **Pier 2 Roller Rink's address was truncated mid-word** ("150
Furman St, Pier") — completed to the real, specific address rather than left as a data-entry cutoff.

Two more descriptions cleaned of leaked navigation (Chelsea Greyhounds Track Club, BronxWorks Cornerstone
Community Centers — the latter's `activityTypes` was also empty and filled in), and two records
(Physique Swimming UES, Berkeley Carroll Summer Programs) were reviewed and left largely as-is — Physique
Swimming got a real description but its address stays at neighborhood grade (already an established,
legitimate multi-venue swim-school model), and Berkeley Carroll's four confirmed campus buildings mean no
single-building guess was made for which one hosts summer camp specifically.

10 records touched (1 quarantine finally applied, 1 rename + enrichment, 4 description/field cleanups, 2
reviewed-and-confirmed, 2 address/neighborhood fixes) plus 2 new creates. `batch_done.json` now at 697 IDs.

### General maintenance batch #7 — a closure statement sitting unread inside a record's own description (2026-08-10)

**Cynthia King Dance Studio's own stored description already said, verbatim, "Cynthia King Dance Studio
is no longer accepting students."** No outside research was needed to find this — the closure statement
was sitting in the data the whole time, just never acted on. Confirmed permanently closed; quarantined.
Distinguishes cleanly from the instructor's separate, still-open ADULT drop-in classes at a different
address, which are a different offering this card was never about. A sharper version of the
already-catalogued "farewell message" signal (apple seeds) — that one required inferring closure from
past-tense marketing language; this one states it outright and just wasn't read carefully.

**Brooklyn Bridge Park Conservancy Programs retired as a duplicate of the Environmental Education record
fixed two batches ago** — its entire description was Form 990 tax-filing links and a general donor
appeal, zero actual program content, while the sibling record already carries the real Environmental
Education Center program and address.

Five more routine fixes: NY Preschool & Kids Club's 94th Street branch got its real address (345 E 94th
St, Yorkville — a borough-level UES placeholder corrected to the actual branch) and phone from the
operator's own find-a-location page; SFX Youth Sports (the general org record, distinct from its Flag
Football sibling fixed earlier) had its placeholder address corrected to Prospect Park, matching both its
own description and its sibling; West Side Soccer League and Harlem RBI/DREAM had leaked-navigation and
mid-sentence-cutoff descriptions replaced with real program facts; Bronx House Community Center had an
empty neighborhood filled in (Morris Park) and `Sports` added to `activityTypes`, which its own
description named but the stored value had dropped.

7 touched: 1 quarantine (closure statement the data already contained), 1 duplicate retired, 5
description/field corrections. `batch_done.json` now at 705 IDs.

### General maintenance batch #8 — a leaked "Source title: / Fact:" prompt artifact, and CodeAdvantage joins the no-fixed-venue list (2026-08-10)

**Ronin Athletics Kids BJJ's description contained a new shape of leaked internal text**: "Source title:
Ronin Athletics Kids BJJ Fact: Ronin Athletics gym has been a pioneer..." — a prompt/extraction TEMPLATE
format ("Source title: ... Fact: ...") leaked verbatim into the public description, distinct from the
navigation-menu and instruction-text leaks already catalogued. Cleaned up; real address found (265 Madison
Ave, Murray Hill).

**CodeAdvantage Manhattan quarantined under the no-fixed-venue prohibition — a coding-education instance
of the same shape as Togetherhood.** Its own site offers "Online Classes" and "In School Programs"
delivered inside PARTNER schools' after-school programs; its own "Locations" nav link 404s, and no
CodeAdvantage-owned venue was found anywhere. Same underlying harm as every prior instance: no door a
family can walk through that belongs to this business.

**Kids in the Game Riverdale — a case where filling in a real address was right, even though the
standing caution excludes NEW creates for this operator.** The standing caution (already applied twice
this session, to Chelsea and East Village Kids in the Game camps) is about not creating MORE cards for an
operator with no venue of its own anywhere — but this record already existed, and its own camp page names
a specific, real, confirmable site: "Amber Charter Kingsbridge Elementary School, 3120 Corlear Ave" — the
same treatment already given to the existing Kids in the Game Inwood record, which also names a specific
Amber Charter building. **The caution is about not creating unverified cards for a no-fixed-venue
operator, not about refusing to enrich an existing card once its specific site becomes confirmable** —
worth stating explicitly since the two could be conflated.

Three more leaked-navigation/promotional-copy descriptions cleaned (Fit4Dance Brooklyn, Dance with Miss
Rachel — a repeated location list, not the unrelated "Ms. Rachel" YouTube personality, worth double-
checking before conflating similarly-named entities — and Color Factory NYC, whose description mixed a
dated ticket-bundle promo and a customer-review quote into what should have been factual copy).

6 touched: 1 quarantine, 1 specific-address fill for an existing citywide-operator record, 4 description
cleanups. Engineering for Kids Manhattan and Broadway Workshop were checked but left with their existing
gaps (no confirmable specific address found for either via static fetch) rather than guessed.
`batch_done.json` now at 713 IDs.

### General maintenance batch #9 — a museum that closed its building entirely, and a batch that was mostly already fine (2026-08-10)

**The Rubin Museum Family Programs quarantined — the museum itself confirms it closed its NYC building.**
Fetching rubinmuseum.org directly returns: "Since transitioning from our physical space in New York City,
the Rubin presents Himalayan art and its insights through traveling exhibitions, participatory experiences,
partnerships, and a dynamic digital platform" — the museum describes itself as "a museum without walls."
140 West 17th Street, the address this record carried, no longer hosts any family program a family could
visit. A sharper version of the confirmed-permanently-closed pattern (City Treehouse) — there the business
had simply shut down; here a whole INSTITUTION restructured away from having a physical location at all,
while continuing to exist and operate in a form this catalogue has no way to represent.

**Six of eight records in this batch (Red Hook Recreation Center, Shirley Chisholm Recreation Center, The
Cliffs at Harlem, both New York Ninja Academy locations, Supreme Martial Arts Upper West Side) were flagged
by the defect-signal scan for missing email/image, and all six turned out to already carry real, specific,
well-written descriptions** — genuine facts (a pool's reduced hours, a subway stop's proximity, a franchise's
sibling locations), not filler. Left untouched. A concrete data point for the standing "signals are a thing
to check, not proof of a problem" rule: in this batch, 6 of 8 flagged records needed nothing.

Opus 118 Harlem School of Music (real, historic East Harlem violin program) had its phone/email filled in
from its own contact page and empty `ageRanges` set to a reasonable elementary-school-age range.

2 touched (1 quarantine, 1 enrichment), 6 confirmed already clean. `batch_done.json` now at 721 IDs.

### General maintenance batch #10 — a fully clean batch, a real negative result (2026-08-10)

All 8 records this batch (My Gym City Point, Ken-Zen Institute, Globall Sports Centers Brooklyn, New
Generation School of Martial Arts, Bergen Beach Sports and Recreation Camp, Dodge YMCA at PS 261, and both
Gymboree Play & Music locations) were flagged by the defect-signal scan purely for missing email/image —
and every one already carries a real, specific street address, a real phone number, and an accurate,
non-generic description. Attempted image pickup via each operator's own og:image tag (`ogpick.py`) found
nothing usable on any of the four checked (all JS-rendered sites with no static og:image) — a real,
recorded negative result rather than a silent skip.

This is the second consecutive batch where most flagged records needed no action (6 of 8 last time, 8 of
8 this time) — worth stating plainly: **the defect-signal queue is now surfacing genuinely well-populated
records more often than genuinely broken ones**, which is itself useful information about where this
pass of the pool stands, distinct from earlier batches in this same session that found a defect in nearly
every record touched. `batch_done.json` now at 729 IDs.

### General maintenance batch #11 — Staten Island's Snug Harbor cluster all shared one empty-neighborhood gap (2026-08-10)

Seven of twelve records checked were already excellent (Chinatown YMCA Beacon Center, Workshop NYC,
New York Rockits, City Climb NYC at The Edge, Champions Martial Arts Avenue C, Nicol NYC Hell's Kitchen,
Sail Academy Inwood) — real, specific, well-sourced content, several with published pricing and hours
lifted directly from the operator's own page. Left untouched.

**Tutu School Upper East Side's description was leaked make-up-class scheduling boilerplate** ("Please do
not hesitate to contact your Tutu School to schedule a make-up class...", repeated) — the same franchise's
description-quality problem already seen at other branches this session, cleaned up the same way.

**Three of four Staten Island records flagged for an empty neighborhood shared the same underlying gap**:
Staten Island Museum and its Earth Camp 2026 program are both on the Snug Harbor Cultural Center campus
(1000 Richmond Terrace) — filled in as Livingston, the North Shore neighborhood Snug Harbor sits in.
Broadway YMCA (651 Broadway) is nearby, filled in as West Brighton. Five Points Academy, in Manhattan (148
Lafayette St), was filled in as Little Italy. All four otherwise had excellent, detailed content — this
was purely a missing-field gap, not a content-quality problem.

5 touched (1 description cleanup, 4 neighborhood fills), 7 confirmed already excellent. `batch_done.json`
now at 741 IDs.

### General maintenance batch #12 — a second Riverside Hawks duplicate, two cultural institutions' addresses independently verified by search (2026-08-10)

**Riverside Hawks Youth Basketball is a second, later duplicate of the same real program** already fixed
once this session — `prov-riverside-hawks` already carries the correct address (490 Riverside Drive,
Morningside Heights) and a full, real description; this record still had the bare Upper West Side
placeholder. Retired as the duplicate. The earlier "token-match bug manufactures cross-host duplicates"
finding was about a `riverside.com` mismatch; this pair is different — both records are correctly sourced
to riversidehawks.org, just two separate discovery hits for the identical real program.

**Anderson's Martial Arts Academy had an internal contradiction** (neighborhood said Greenwich Village,
address already said NoHo) — the same check-a-record-against-itself class of fix as Ballet Tech and the
Whitney Museum. Corrected the neighborhood to match the already-correct address.

**Two real cultural institutions' addresses were independently confirmed via web search rather than a
site fetch**, since both operators' sites are JS-rendered and yielded nothing to a static fetch: Instituto
Cervantes New York (211 E 49th St, Turtle Bay — phone matched exactly what was already on file, a good
cross-check) and the Lycée Français de New York's Cultural Center (505 E 75th St, Lenox Hill). Both had
leaked-navigation or off-topic scraped-fragment descriptions replaced with real copy — the Lycée's in
particular had been describing an unrelated student genealogy/voting-rights project, not the cultural
center itself.

Wave Hill Family Art Project's empty neighborhood was filled in as Riverdale. Six other records in this
batch (Prospect Park YMCA, Bridge for Dance, both Treasure Trunk Theatre locations, Arts in Action VAP,
Children's Museum of Manhattan, Beat the Bomb Brooklyn) were checked and already carried real, specific,
non-generic content — left untouched.

5 touched (2 address fills verified via search, 1 internal-contradiction fix, 1 duplicate retired, 1
neighborhood fill), 7 confirmed already good. `batch_done.json` now at 753 IDs.

### General maintenance batch #13 — a wrong-neighborhood catch found by fetching the operator's own site, and a near-miss deliberately not taken (2026-08-10)

**New York Empire Baseball was filed under Harlem; its own site names its Manhattan location plainly**:
"The Arena is located behind Lincoln Center at 251 West 60 Street" — Nominatim independently returns a
POI match for "New York Empire Baseball" at that exact address, confirming it. Corrected neighborhood
(Harlem → Lincoln Square) and address together, the same discipline as the Yang Taekwondo/Tiger Schulmann's
Chelsea fixes earlier — never correct one field of a location without checking the others.

**Creative Art Works Brooklyn — a near-miss caught before it became a new mistake.** Its contact page
gives a specific, verifiable address (520 8th Ave, Suite 201A, matching the org's own phone and email
exactly) — every other fix this session would have written that straight into the placeholder address.
But that address is in Manhattan (Garment District), and this record is specifically titled and bordered
"Creative Art Works Brooklyn," representing the organization's Brooklyn programming. Writing the confirmed
Manhattan office address into a Brooklyn-bordered record would have created the exact defect this session
keeps finding and fixing elsewhere (a parent organization's HQ address overwriting a program's real
location) — deliberately left at borough grade instead, with the finding recorded so a future pass knows
the office address was seen and rejected, not missed.

Four more leaked-navigation descriptions cleaned (Silver Music, Snapology Long Island City, Twin Parks
Montessori "Summer Program" — three separate real campuses named on the operator's site, none
distinguished as the specific one hosting this record, left as an honest gap — and The Door NYC, whose
description was a donation-page scrape of gift-amount buttons and impact statistics rather than a
description of its actual services; also got its real address, 555 Broome St, refined from SoHo to the
more precise Hudson Square). Little Sharks Playground's empty neighborhood was filled from its own record
ID (Tottenville), and its `longDescription` — a generic "top indoor playground near me" SEO blurb — was
replaced with the real facts already sitting correctly in its own `shortDescription`.

7 touched: 1 wrong-neighborhood correction verified two ways (operator site + independent geocode POI
match), 1 deliberate non-write to avoid a parent-HQ-address mistake, 5 description/field cleanups.
`batch_done.json` now at 764 IDs.

### General maintenance batch #14 — a mailing address in Rhinebeck, and West Side Taekwondo's own address contradicting its own neighborhood (2026-08-10)

**Camp Broadway's confirmed contact address is 103 East Market Street, Rhinebeck, NY 12572** — upstate,
Dutchess County, nowhere near NYC. This is the organization's (Broadway Education Alliance's) registered
mailing address, not a camp venue. A second instance of the parent-HQ-address trap this session already
named for Creative Art Works, but sharper: that one was at least in the right CITY (Manhattan, wrong
borough for a Brooklyn record); this one isn't in New York City at all. Deliberately left the Midtown
placeholder in place rather than write an out-of-city mailing address into a Manhattan camp's location
field, and enriched the description with real program names (Mainstage NYC, Shining Stars, Ensemble)
instead.

**West Side Taekwondo's own stored address already contradicted its own neighborhood** — 243 W 124th
Street is deep in Central Harlem, not the Upper West Side the record claimed. The same
check-a-record-against-itself class of fix as Ballet Tech, the Whitney Museum, and Anderson's Martial
Arts Academy, now confirmed four times in one session — worth treating as a standing, cheap check on
every record touched, not just something to notice occasionally.

**Wiz Kids Basketball's description had the same leaked-site-chrome shape as several other records this
session** ("Coming Soon always working... Tweets by wizkidsaau... Copyright © 202") sitting next to real
program facts (a Books B4 Ball academic-eligibility requirement) further down — cleaned, keeping the real
facts. **Dance Theatre of Harlem's Saturday Youth Drop-In Classes record described the COMPANY overall**
("Dance Theatre of Harlem is an American professional ballet company...", the kind of generic sentence a
Wikipedia infobox would produce) rather than the specific drop-in program the card represents — rewritten
to describe the actual Saturday program.

Four more routine fixes: three Staten Island/Bronx records had empty neighborhoods filled in from
geocodes or, in Wiz Kids' case, the street's own name (Baychester Avenue → Baychester); St. Patrick's CYO's
neighborhood was filled from a genuinely compound real description ("Bay Ridge/Ft. Hamilton") by picking
the parish's primary identity, flagged `needs_human` since it's a judgment call between two adjacent real
answers, not a single confirmed fact; Jalopy Theatre School of Music had a customer-quote fragment removed
from mid-description and empty `ageRanges` filled from the operator's own "newborns to seniors" language.

8 touched: 1 deliberate non-write (out-of-city mailing address), 1 neighborhood/address contradiction
fixed, 6 description/field corrections. `batch_done.json` now at 774 IDs.

### General maintenance batch #15 — a third Art/Music activityTypes bug on the same franchise, and a possible stale business name flagged rather than guessed (2026-08-10)

**Tiger Schulmann's Upper West Side carried the identical `activityTypes: ["Art","Music"]` substring-match
bug already found and fixed on the Chelsea branch** — a third confirmed instance of this exact chain-wide
defect (the Tribeca duplicate-merge fix earlier this session also touched a stale phone on a Tiger
Schulmann's record, though not this specific bug). Worth a franchise-wide check: at this rate, any
un-reviewed Tiger Schulmann's branch is a reasonable bet to carry the same wrong tags.

**Kids N Motion Dance & Gymnastics — a naming question flagged, not guessed.** The stored NAME is "Kids N
Motion Dance & Gymnastics," but the operator's own site introduces itself repeatedly and consistently as
"Brooklyn Gymnastics and Dance (BGD)" — never once as "Kids N Motion" anywhere in the fetched content.
This could be a stale/former business name, or "Kids N Motion" could be a specific sub-program the site
just doesn't surface on its main pages — genuinely ambiguous from what a static fetch can confirm. Filled
in the real neighborhood (Midwood, from a Nominatim POI match on the East Midwood Jewish Center, the
building this program runs inside) and cleaned the description, but left the NAME question as a recorded
`needs_human` flag rather than renaming on a guess.

**Junior Rangers Learn to Play Hockey's Marine Park address was verified against the NHL's own locations
page rather than assumed from the record alone** — confirmed Aviator Sports Complex is a real Rangers
Learn to Play rink there, which matters because most of the other addresses on that same NHL page are
outside NYC (Connecticut, Westchester) and the record could easily have been describing the wrong rink
entirely. Its description was a jumbled FAQ-list fragment ("B) Your child is too advanced for the
program...") — cleaned to a real description once the venue was confirmed.

Queens County Farm Museum's description was a literal scraped CALENDAR WIDGET (day-of-week abbreviations
and "0 events" counts) rather than any description at all — the plainest instance yet of the
scraped-page-furniture pattern, replaced with real facts about the farm. The Barrow Group Kids & Teens and
Good Shepherd Services both had thin/fragment descriptions replaced with real program facts.

6 touched: 1 chain-wide activityTypes bug (3rd confirmed instance), 1 naming question flagged for a
future pass, 1 venue independently cross-checked against a national organization's own site, 3 description
corrections. `batch_done.json` now at 784 IDs.

### General maintenance batch #16 — a card describing an unrelated adult pop-up event, and a shared-venue-tenant pair confirmed rather than merged (2026-08-10)

**Brooklyn Bridge Park Soccer Shots' website and description described an entirely different, unrelated
event — not a reality-check failure of the entity, but of the SOURCE PAGE picked for it.** The record is
named for Soccer Shots, a real national youth soccer instruction program that Brooklyn Bridge Park does
host — but its stored website pointed to `brooklynbridgepark.org/adidas-home-of-soccer/`, a page for a
2026 adult-oriented World Cup fan-zone pop-up (live match screenings, a beer garden, cultural
programming, June-July dates). A family reading this card would have learned about a beer garden, not a
kids' soccer class. Corrected to the same real soccer program page its sibling record
(`...-soccer-shots-prospect`) already correctly used. Distinct from every off-topic-contamination case
already catalogued: the ENTITY (Soccer Shots at Brooklyn Bridge Park) is completely real, only the
specific page picked to source it from was wrong — one host, two totally different pages, and the wrong
one got attached.

**Eastside Westside Music Together's stored website was a third-party discovery-platform link
(sideways.nyc), not a scam or dead end, but not the operator's own site either** — that listing itself
named the real operator ("Center for Family Music: East Side West Side Music Together") and its real
domain (eswsmusictogether.com), corrected accordingly. This confirms, rather than merges with, Muse Arts'
presence at the same building (102 West 75th Street) — the sideways.nyc listing independently names East
Side West Side Music Together as a DIFFERENT licensed Music Together operator sharing that address, the
same shared-venue-tenant shape as Chelsea Piers and the Yorkshire Towers SwimJim/Gotham City Swim pair,
not a duplicate to retire.

**Brooklyn Brazilian Jiu-Jitsu had a wrong neighborhood AND an incomplete address in the same field** —
"412 Myrtle Avenue" with no city, state or ZIP, and a stored neighborhood (Cobble Hill) that a geocode of
the address itself contradicts (Fort Greene). Both fixed together.

Three more leaked-chrome descriptions cleaned: a Brooklyn Bridge Park Conservancy Soccer Shots record
whose description was a bare pricing table, Trail Blazers' repeated "DONATE enroll" button chrome
truncated mid-list with a literal "[…]", and — a near-miss worth naming — a citation ("a 2016 Wall Street
Journal survey of 900+ executives") that a naive address-shaped regex briefly mistook for a street address
before the surrounding text was actually read. Chuck E. Cheese's empty neighborhood (Bronx Terminal
Market) was filled in as Mott Haven.

6 touched: 1 wrong-source-page fix on an otherwise-real entity, 1 website correction confirming (not
merging) a shared-venue-tenant pair, 1 combined neighborhood+address fix, 3 description cleanups.
`batch_done.json` now at 794 IDs.

### General maintenance batch #17 — an image filename living in an email field, and a "Brooklyn" record that was Manhattan the whole time (2026-08-10)

**Code Ninjas Brooklyn's `email` field held "jumping@2x.webp"** — a retina-resolution image asset
filename, not an email address, presumably captured by an extraction pass that matches on the `@`
character without checking what surrounds it. Cleared. Its address remains the already-documented
template-placeholder case ("1234 Street Place," baked into the franchise page itself) — nothing new to
fix there, left at neighborhood grade as already decided.

**Kano Martial Arts Kids Brooklyn is a Manhattan business — its own address was sitting inside its own
description the whole time.** The record's NAME says "Brooklyn," but its `borough` field already
correctly said Manhattan, and its own scraped description contained the real address in plain text:
"149 West 27th Street, 1st Floor, New York, New York 10001" — Midtown, not Brooklyn at all. A wrong-
borough NAME on an otherwise-correctly-bordered record is a new shape: every prior wrong-borough-name case
this session (Karate City, Tiger Schulmann's, PLAYDAY) had the WRONG FIELDS following the wrong name; here
the fields were already right and only the name lagged behind. The same description also contained a
large block of leaked HTML FORM-FIELD ATTRIBUTES (`data-val-required`, `pattern="^[^%$\(\)<>&@;*]+$"`,
`maxlength`) — a scrape that captured an entire `<input>` tag's attributes as visible text, a new and
more severe shape of the leaked-page-furniture pattern than any navigation-menu or donation-widget case
found so far this session.

**Axiom Learning NYC quarantined — a clean out-of-market fabrication, no ambiguity.** The operator's own
Locations page names exactly three real sites: Concord, MA; Wellesley, MA; and Kuala Lumpur, Malaysia.
Zero in New York City. Matches the already-catalogued out-of-market pattern (the Georgia camp company
case) exactly — a real company, confidently real-looking record, zero real presence in the market this
platform serves.

Three more leaked-navigation/promotional-flyer descriptions cleaned (Private Picassos — a customer-
testimonial fragment; Brooklyn Titans Youth Football & Cheer — all-caps flyer copy plus site nav chrome;
City Kids Williamsburg — a repeated headline and logo-alt-text fragment).

6 touched: 1 broken-field bug (image filename in an email field), 1 wrong-borough NAME on an otherwise-
correct record, 1 out-of-market quarantine, 3 description cleanups. `batch_done.json` now at 804 IDs.

### General maintenance batch #18 — nine of ten records already excellent (2026-08-10)

A striking batch: KoKo NYC, Ferox Ninja Playground DUMBO, VITAL Climbing Gym LES, Herbert Von King Cultural
Arts Center, Brooklyn Aikikai, Hinds Combat Sports Midtown West, My Gym Cobble Hill, Elite Swimming NYC and
Combat Club by KMI were ALL already real, specific, well-sourced records — several carrying details this
session has specifically trained on catching right (Hinds Combat Sports' own record already correctly
notes its 201-area-code phone is a "mobile line that kept its number... not an error," and Elite Swimming
NYC's own record already explains why it's listed despite Midwood having "thin swim coverage"). Only PGA
Summer Camps at Golfzon Social Brooklyn needed a real fix — a street-only address completed with city/
state/ZIP (geocode-confirmed Downtown Brooklyn) and a generic description replaced with the camp's real
curriculum.

This is now the third batch out of the last five where 8+ of 10 records needed no correction — consistent
with the queue increasingly surfacing well-populated records as the higher-defect-density records get
worked through. `email_missing` alone, now the dominant remaining signal (66 of 243 flagged records),
is frequently not a real defect: many legitimate small operators simply don't publish one.

1 touched (address completion + description polish), 9 confirmed already excellent. `batch_done.json`
now at 814 IDs.

### General maintenance batch #19 — another mostly-clean batch, one generic slogan replaced (2026-08-10)

Nine of ten records (Children's Tumbling, Asphalt Green Sports at MOCC, Mushin MMA Greenwich Village, Bay
Ridge Summer Sports and Theatre Camp, Martial Arts Family Studio, Champions Martial Arts Chinatown, Bo Law
Kung Fu, Manhattan Shaolin KungFu and QiGong, Two Bridges Neighborhood Council Basketball) were already
real, specific and well-sourced — several with the kind of detail this session's own hard-won lessons
would have flagged as missing if it weren't already there (Bay Ridge's DOHMH permit citation, Two Bridges'
"this is not a paid class" callout, Asphalt Green's explicit note that it runs the field component of a
shared building rather than a campus of its own). Only International Martial Arts Center needed a fix —
its description was a generic marketing slogan ("Experience the best Martial Arts in NYC. Join...")
identical short and long, replaced with a factual description using facts already on the record.

Fourth consecutive batch where 8+ of 10 records needed no correction. 1 touched, 9 confirmed clean.
`batch_done.json` now at 824 IDs.

### Zero-sport-coverage neighborhood sweep — a targeted pivot away from the diminishing-returns signal queue (2026-08-10)

After four consecutive general-maintenance batches trending toward "mostly already clean," pivoted to a
more directional exercise: which browsable neighborhoods have ZERO sport listings at all, and can any be
resolved with genuine, verified businesses rather than left as a gap. `zero_nb.py` (new) lists them
directly from the same coverage report the owner-requested status check already runs. Before this sweep:
11 of 54 Brooklyn neighborhoods and 9 of 38 Manhattan neighborhoods had zero.

**Two resolved, both found by cross-checking rather than blind discovery.** Champions Martial Arts Avenue
C (177 Loisaida Ave) was already correctly created earlier this session, but filed under East Village —
a geocode of its own exact address returns Alphabet City specifically, a distinct, already-vocabulary
neighborhood showing zero coverage. Corrected the neighborhood; East Village didn't need the record and
Alphabet City did. **Training Zone NYC's Manhattan location resolves Stuyvesant Town's zero-coverage gap,
and does so in a way that specifically avoids the still-open StuyTown/PCV access question from earlier
this session**: the operator's own page brands the location "Gramercy Park" for search reach, but an
independent Nominatim POI match for "Training Zone" at its exact address (329 1st Ave) returns the real
neighbourhood, "Stuy Town" — and unlike the property-management-hosted StuyTown vendor cards flagged
earlier, this is a genuinely independent, publicly-bookable commercial martial arts school, not a resident
amenity. **Never trust a business's own SEO neighborhood branding over an independent geocode of its
actual address** — the second time this session that discipline caught something (after NY Empire
Baseball's "Harlem" claim for an address literally behind Lincoln Center).

**One near-miss correctly avoided**: Equinox Gramercy surfaced as a lead for the Gramercy gap, but this
catalogue already has a standing finding that Equinox's "Kids Club" is drop-off childcare for adult gym
members, not a children's activity — the same business, found again from a different angle, correctly
excluded again rather than re-litigated.

**Real negative results, stated plainly rather than silently dropped**: targeted searches for Fort
Hamilton, Marble Hill, Navy Yard, Vinegar Hill, Lincoln Center, and Tudor City found nothing genuinely
located IN those specific areas — every lead was either a nearby neighborhood's business (a "Brooklyn
Gymnastics" address that geocoded to Bath Beach, not Fort Hamilton) or a general NYC-wide result with no
neighborhood-specific confirmation. These are small, low-density, or non-residential areas (a military
base, an industrial complex, a tiny historic pocket, a cultural campus, a gated enclave), so a genuine zero
is plausible rather than a research failure — but recorded as unresolved, not silently treated as done.

Coverage: Manhattan zero-sport neighborhoods 9 → 7; Brooklyn unchanged at 11 (no Brooklyn gap resolved this
pass). Total served sport listings 476 → 478. `batch_done.json` now at 825 IDs.

### Sovereign loop, resumed manually — two directory-scrape quarantines, one placeholder listing revealed, one new create, three confirmed-terminal touches (2026-08-10)

Resumed the global oldest-first loop by hand after the concurrent-agent handoff earlier this session.
Eight items across the three collections, oldest-first, no cards skipped:

1. **`meetup-mommy-and-me-club`** and **`meetup-psychology-today`** quarantined. Both `meetupGroups`
   records were named after, and sourced from, a nationwide directory-aggregator's own SEO search page
   (mommyandme.club's per-city template; Psychology Today's Brooklyn support-group search results) —
   the stored `name` was literally the aggregator's own brand, not a specific group. Psychology Today's
   page is additionally about adult prenatal/postpartum therapy, not a children's activity at all.
2. **`prov-untitled-listing` fixed and revealed.** Name was the literal placeholder `"Untitled Listing"`
   and address a bare `"Upper West Side, Manhattan, NYC"`. The website (nycelite.com) named the real
   business — NYC Elite Gymnastics — and its Upper West Side branch page gave a real street address,
   phone and email; the stored borough/neighbourhood already narrowed to that one branch (of three), so
   no split was needed. The existing shortDescription/longDescription turned out to be the operator's own
   genuine About Us copy verbatim, not scraped chrome — confirmed rather than rewritten. Passed the full
   public gate on every field; revealed.
3. **Two `contentCards` confirmed already-correctly-terminal**: `cc-c2837e9031d1e98779f53e5b` (Project
   Kid, a crafts blog, not an activity provider — corroborated by the linked providers record) and
   `cc-1392344004f6f1f296bb043c` / `cc-90c974b4246109a25d6cb2b9` (two cards from one bad discovery run
   against a "28 Iconic Things to Do in Manhattan" listicle, one of them extracted the fragment "To" as
   its title). All three: existing terminal diagnosis re-verified against the live source, `touch: true`,
   no change needed.
4. **`cc-32bed8b9acd447feca41f2fc` (NY1 news article) confirmed terminal, with a lead recorded.** The
   article covers Kaufman Music Center's small instrument-donation pilot — real, but a news article about
   a program is not itself a bookable listing. Recorded the lead (Kaufman Music Center, kaufmanmusiccenter.org,
   Upper West Side) for a future pass rather than chasing it inside this card's own scope.
5. **`cc-186c3a638cad2658ae824b04` → `prov-the-katmint-learning-initiative` created.** The scraped
   source was thekatmint.com's `/who-we-are/` chrome page, correctly flagged as not-a-listing — but the
   real entity (The Katmint Learning Initiative, a full-day early-childhood program) was genuinely
   uncatalogued. Geocoded its address independently rather than trusting the stored guess: the card said
   "Downtown Brooklyn," the real address resolves to Bushwick. Created a real record from the operator's
   own homepage (name, address, phone, email, hours, program list); corrected the source contentCard's
   `boroughGuess`/`neighborhoodGuess`/`sourceUrl` and recorded the new provider's id in `terminalReason`
   rather than trying to promote the old card. **A second Katmint site (637 Lexington Ave, ~half a mile
   away, independently geocoded as a distinct building) exists and does not yet have its own record** —
   recorded as unresolved rather than merged into one listing or silently dropped.

No taxonomy match exists for "full-day early-childhood program" among the four `CATEGORY_VALUES` or the
eighteen canonical `activityTypes` — used `Classes` / `Indoor Play` as the closest evidenced fit and said
so plainly rather than picking something more specific-sounding but unevidenced.

### Sovereign loop, continued — stale Imagine Swimming lead, a live duplicate listing found and fixed, one junk source confirmed (2026-08-10)

Continuing the hand-run oldest-first loop:

1. **`cc-6b82ac1d5c36869c669da50c` ("Imagine Swimming Brooklyn Heights") quarantined as a stale
   lead.** Independently checked the operator's current `/locations` page: Imagine Swimming's five real
   locations today are TriBeCa Flagship, TriBeCa BMCC, Upper West Side, Crown Heights Armory, and Montauk
   Playhouse — there is no Brooklyn Heights location. The business is already extensively catalogued
   under its correct locations; this specific lead does not correspond to anything real.
2. **A live duplicate listing found and fixed while researching #1.** `prov-imagine-swimming-crown-heights-12ce264e`
   and `prov-imagine-swimming-crown-heights-armory` are two separate provider records for the identical
   physical pool (1561 Bedford Ave, Brooklyn) — same address, phone, email. The first was the one
   actually LIVE (no visibility flag set), sourced from the bare homepage with a generic shared stock
   banner (`csny-banner-sports_507.png`, one of this catalogue's already-known 16 reused image files) and
   a repeated "OUR STAFF" blurb. The second — better-evidenced, with a dedicated source page, a real
   per-listing photo, and a proper weekly-lessons schedule — was sitting hidden. Quarantined the weaker
   duplicate and revealed the correct one, so exactly one Crown Heights listing is now live instead of two.
3. **`cc-d6539e1f40b36e2604ffca63` ("Imagine Swimming Tribeca") quarantined as already covered** — its
   own source page is genuinely correct, but `prov-imagine-swimming-tribeca` already exists, published,
   at the same address; re-enriching this card would only recreate what already exists.
4. **`cc-0056dedbeafeb506a9442a88` ("Parent group research, Bedford-Stuyvesant")**: already `QUARANTINED`
   with `blockerCodes: [placeholder_or_junk_source]` but a null `terminalReason`. Verified the source
   (dunyanews.tv) is a Pakistani news portal's generic homepage with no connection to any Brooklyn parent
   group, and filled in the missing reason rather than leaving it blank.

Pattern worth naming: researching one card in a multi-location operator's cluster is now reliably
surfacing OTHER defects in that same operator's other records (the address-guess correction two batches
ago, and now a live duplicate) — worth deliberately re-checking a whole operator's cluster once one of
its cards is touched, not just the single card the queue happened to serve up.

### Sovereign loop, continued — cleared a large backlog-compaction cohort missing terminalReason, two more real creates (2026-08-10)

Discovered the globally-oldest queue position was dominated by a large cohort from the 2026-07-05
backlog-compaction event: hundreds of `contentCards`, all `QUARANTINED` with a `placeholder_or_junk_source`
(or similar) blocker code already correctly set, but `terminalReason` left `null`. Verified the pattern on
several representative samples first (internal `internal://classscout/source-seed/...` placeholders with
no real page at all; external domains — `zhihu.com`, `who.int`, `dunyanews.tv`, `apps.microsoft.com`,
`id.wikipedia.org` — with zero connection to any NYC children's activity), then cleared 121 of them by
filling in the missing `terminalReason` and touching each, so the queue can move past this cohort instead
of re-serving the same null-reason cards indefinitely.

**Two more real, previously-uncatalogued entities found while triaging this cohort, both created:**
- **`prov-the-international-preschools-ips`** — a real 60+-year Upper East Side preschool
  (345 East 86th Street). Its content card had been mismatched to a "parent group research" search;
  the source (ipsnyc.org) is real, but the entity is a preschool provider, not a meetup group. Corrected
  the source card's `categoryHint` and `terminalReason` to record the entity-type mismatch and the new
  provider id, rather than force-fitting it into `meetupGroups` enrichment.
- One card ("Upper West Side Parents") turned out to be a personal parenting blog/media property
  (~1M monthly pageviews per its own about page), not a specific group — confirmed terminal, not created,
  since a media property is not the entity a "parent group" card is meant to describe.

Not yet reached the end of this cohort — still paging through it at the same `updatedAt` timestamp.

### Sovereign loop, continued — another real create (The Canopy, Williamsburg), backlog cohort now at ~217 cleared (2026-08-10)

Continued paging through the 2026-07-05 backlog-compaction cohort. Sixty-eight more cards cleared
(same pattern: internal seed placeholders, plus off-topic external domains — a French Huawei-unlock
tech-support forum, a German football livestream page, more Bing/zhihu/dunyanews repeats).

**`prov-the-canopy` created** — a real 5,000 sq ft playspace and parent-support studio in Williamsburg,
Brooklyn (118 N 11th St Floor 3), for babies/toddlers up to age 4, running Baby & Me Yoga, postnatal
yoga, and a free weekly postpartum support group. A direct fetch of the operator's own Squarespace-hosted
domain hit a TLS/SNI certificate mismatch (`*.squarespace.com` cert not covering the custom domain) —
corroborated instead via three independent secondary sources (a PRWeb press release, a Macaroni Kid
Brooklyn NW event listing, a Sawyer marketplace listing) that agreed on name, address, phone and program
list before creating. `alignActivityTypes` re-derived `["Yoga", "Sports"]` from the description text
rather than the `["Indoor Play", "Yoga"]` first supplied — accepted the system's own classification since
yoga is specifically and repeatedly evidenced in the copy, more so than generic "Indoor Play."

Running total this session: 4 real provider creates (Katmint, PlayGroup NYC Park Slope, IPS NYC, The
Canopy), 1 placeholder-listing fix+reveal (NYC Elite Gymnastics UWS), 1 live-duplicate fix (Imagine
Swimming Crown Heights), ~217 backlog cards cleared, several quarantines and stale-lead corrections.
Backlog cohort not yet exhausted.

### Sovereign loop, continued — past the backlog cohort into real leads; a live duplicate and a mislocated card found, a real code fix shipped (2026-08-10)

Cleared the last 3 stragglers of the 2026-07-05 junk-source backlog (220 total cleared), then moved into
a run of genuinely real, already-`PUBLISHED` `contentCards` (YMCA branches, Neighborhood Music School,
Aviator Sports, martial arts/gymnastics/skating schools, JCC camps, Randall's Island, etc.).

**Two real defects found and fixed:**
1. **A second live duplicate provider pair**, same shape as the earlier Imagine Swimming one:
   `prov-new-york-city-s-ymca` (badly-named, generic, low category confidence) and `prov-west-side-ymca`
   (well-sourced, specifically named, real staff contact) are the same West Side YMCA branch at 5 West
   63rd Street. Quarantined the weaker duplicate.
2. **`cc-c358db37f2f8163b3c6d627a` (Evolutionary Martial Arts) was mis-located** — guessed Upper West
   Side, but the real school (confirmed via Yelp and its own Facebook page) is at 64 E 4th St in the East
   Village. Corrected the neighbourhood.

**A real code fix shipped, found while double-checking #2 before creating a providers record for it**:
attempted to create `prov-evolutionary-martial-arts`, and the generated id came back
`prov-evolutionary-martial-arts-2` — meaning a record by that name already existed. It did: address
"64 East 4th Street" (spelled out) against my "64 E 4th St" (abbreviated) — the SAME building, but
`normalizeStreetAddress`'s duplicate-address check only folded street-TYPE suffixes (street→st,
avenue→ave, …), never directional prefixes, so the two forms hashed to different keys and the collision
check would have missed a real duplicate had the id not happened to reveal it. Added east/west/north/south
folding to both copies of the function (`cardBridgeCreate.ts` and its `addressClusters.ts` twin) with a
regression test; 392 tests pass. Shipped in `526e0e9`.

The remaining ~17 cards in this run were all already `PUBLISHED`, specifically named, and geographically
sensible for well-known real NYC youth programs (Karate City UWS/UES as two genuine branches, Tiger
Schulmann's Bay Ridge, Randall's Island Park Alliance, Greenpoint YMCA, etc.) — reviewed and touched, no
further defects found this pass.

### Sovereign loop, continued — a further run of real published cards, ~280 cards processed this session (2026-08-10)

Reviewed the next window: two already-adequately-quarantined real leads (Wollman Rink Skate School,
mismatched to a Microsoft source but already carrying a substantive terminalReason; Imagine Swimming
Manhattan, correctly flagged as a vague multi-location catch-all rather than merged into the operator's
existing per-branch records) needed no further action. Verified `aviatorsportclub.com` is a second real
domain for the same Aviator Sports & Events Center (Floyd Bennett Field) rather than a mismatch. The
remaining 23 cards (The Little Gym Brooklyn Heights, Sokol NY Youth Gymnastics, NY Kids Club's several
Brooklyn/Manhattan locations, Fastbreak Kids' several UWS/Downtown cards, Broadway Gymnastics School,
Asphalt Green Battery Park City, MetroRock Brooklyn Kids, etc.) were all specific, well-formed, and
geographically sensible — confirmed and touched, no defects found.

### Sovereign loop, continued — a mis-geocoded LA card and a keyword-collision quarantine (2026-08-10)

Two more real defects found and fixed in this window:
- **`cc-437dbccb006e7a33ce17cbcc` ("Playgroup Los Angeles") was guessed Manhattan/Upper West Side** for a
  real Los Angeles nature-based parent-child program (its own site names a class at the LA Arboretum,
  Arcadia). Not a wrong NYC neighbourhood — a wrong market entirely. Corrected to San Gabriel Valley/Arcadia.
- **`cc-eebcebf208d5cf5b40353124` ("Asphalt Green Basketball Foundations") quarantined** — its source,
  manassasasphalt.com, is an unrelated Virginia paving contractor matched only on the word "asphalt," not
  the real Asphalt Green sports nonprofit. Was stuck in `PARKED_COOLDOWN` past its own re-run date with
  nothing behind it.

The remaining ~40 cards in this window (a wide mix of pipeline states — `PUBLISHED`, `PREPARING`,
`DISCOVERED`, `PARKED_COOLDOWN`, `REPAIRING`) were all specific, well-formed, plausible real NYC youth
programs (My Gym, Chelsea Piers' several programs, Little League branches, Prospect Park facilities,
Hola BK, Cobble Hill BJJ, etc.) — confirmed and touched, no defects found.

### Sovereign loop, continued — a systematic keyword-collision pattern, and confirming an already-safe adult-content quarantine (2026-08-10)

**Safety note, not a new finding**: four cards sourced from adult-content sites (pornhub.com x3,
xvideos.com x1) were already correctly `QUARANTINED`/`operationalVisibility: quarantined` — the
pipeline's own discovery-safety net had already caught and hidden them; this pass only filled in the
missing `terminalReason` for the audit trail. Nothing was ever visible to a family.

**A systematic keyword-collision pattern, not a one-off**: THREE separate "Asphalt Green" cards
(Basketball Foundations, Baseball Academy, Youth Sports Classes, plus a bare "Asphalt Green" card) had
all been matched to `manassasasphalt.com` — an unrelated Virginia paving contractor, hit only on the
word "asphalt." Quarantined all four with the pattern named explicitly, since a single fix wouldn't have
surfaced that it kept recurring. Also quarantined: "Marlene Meyerson JCC Manhattan" matched to a baby-name-
meaning page for "Marlene"; a Harry Truman Presidential Library biography card; an FC Barcelona match
schedule page matched on football/schedule keywords against an NYC card; and a Chelsea Piers Brooklyn
gymnastics card sourced from a third-party listicle rather than the operator's own site (already covered
by sibling cards sourced correctly).

Remaining ~15 cards in this window were real, well-formed, correctly-sourced leads (British Swim School,
Chelsea Piers' several camps, 92nd Street Y, Modern Martial Arts NYC, Uptown Soccer Academy, Brooklyn
Boulders) — confirmed and touched.

Running total this session: 4 real provider creates, 2 live-duplicate fixes, 1 code fix (directional
address normalization, shipped with a regression test), and well over 300 content cards reviewed across
the backlog-compaction cohort and several windows of real leads.

### Sovereign loop, continued — a second adult-content wave confirmed safe, a real business held back from a bad address guess (2026-08-11)

Another wave of already-`QUARANTINED` junk (three more adult-content sites — epornz.com, xhamster.com,
fuq.com — all correctly hidden already; a PC-game-download site; ten more internal-seed placeholders)
filled in with terminalReason and touched.

**A real business found, but NOT created** — the disciplined outcome, not a shortcut: `cc-3a2cf8370ddda9a39e414af7`'s
title was the generic location fragment "New York, Ny" for what is actually Children's Art Classes, a
25-year-old NYC art-class franchise. Its own site gives "752 West End Avenue NY, NY 10025" — the exact
same bare address already held by two other real, unrelated tenants in this catalogue (Imagine Swimming,
FunFit Kids), with no suite number anywhere on the operator's site. Rather than invent a distinguishing
suite to get past the create endpoint's own duplicate-address guard (the guard this session added
directional-prefix folding to, two batches ago), fixed the card's title only and left the create for a
future pass once a real suite number turns up — recorded as an open gap, not silently dropped.

Session totals now: 4 real provider creates, 2 live-duplicate fixes, 1 code fix, and roughly 350
`contentCards` reviewed.

### Sovereign loop, continued — five real LA institutions had no region at all; more keyword collisions (2026-08-11)

**A genuine gap, not a wrong guess**: five real, well-known LA family institutions (City of Pasadena
Recreation, The Getty Center, Boys & Girls Clubs of Greater LA, Discovery Cube LA, Aquarium of the
Pacific) reached `DISCOVERED` with `boroughGuess` entirely missing (`null`), not just wrong. Filled in
the real region/neighbourhood for four of them from their own known addresses (Pasadena→San Gabriel
Valley, Getty Center→Westside/Brentwood, Discovery Cube→San Fernando Valley/Sylmar, Aquarium of the
Pacific→Gateway Cities/Long Beach — confirmed against the canonical `LA_AREAS`/`NEIGHBORHOODS` tables
rather than guessed). Left Boys & Girls Clubs of Greater LA's region blank rather than picking one: it is
a genuinely citywide umbrella with many branches, the same "citywide programme, not one location" pattern
already established for split candidates this session.

More keyword collisions and guide pages quarantined: a Wikitravel article about all of Manhattan; an
"Untitled listing" sourced from a multi-venue party-space listicle; Tower Bridge in **London** (matched
on "bridge"); a farm-equipment retailer selling cattle crushes (previously carrying only an
auto-generated blocker-code string as its terminalReason, not an actual explanation — replaced with one);
one more already-safely-quarantined adult-content card. The remaining real leads (Dance with Miss Rachel,
three Marlene Meyerson JCC Manhattan pages, Complete Playground, Crossbar) confirmed clean.

### Sovereign loop, continued — a whole cluster of 21 real LA institutions had no region at all (2026-08-11)

A large, single discovery run (2026-08-07, ~10:31:49–55, sequential) surfaced 23 real, well-known LA-area
family institutions — zoos, museums, nature centers, city parks-and-rec departments, libraries — every
one of them with `boroughGuess: null`. Not a wrong guess this time: no guess at all. Filled in the real
region and neighbourhood for 21 of them from their own well-known addresses, checked against this
repo's own canonical `LA_AREAS`/`NEIGHBORHOODS` tables rather than assumed (Los Angeles Zoo and the Autry
→ Central LA/Los Feliz via Griffith Park; Skirball Cultural Center → Westside/Bel Air via Sepulveda Pass;
Cabrillo Marine Aquarium → Harbor/San Pedro; Placerita Canyon Nature Center → Santa Clarita Valley/Newhall;
and sixteen more). Left two genuinely citywide/countywide systems (LA Public Library, LA County Library)
with no region at all, rather than picking one branch's location for an institution that has dozens —
the same "citywide programme, no single home" judgement applied to Boys & Girls Clubs of Greater LA
earlier this session.

Session totals: 4 real provider creates, 2 live-duplicate fixes, 1 code fix, 26 real region/location
corrections (5 NYC neighbourhood/market fixes + 21 LA region fills), and over 400 `contentCards` reviewed.

### Sovereign loop, continued — the LA region-gap cluster continues, a real NYPL/BPL library run confirmed (2026-08-11)

Ten more LA institutions from the same no-region discovery run fixed (STAR Eco Station, California
Science Center, Madrona Marsh Nature Center, LACMA, Pasadena Public Library, Glendale Library, City of
Santa Clarita Recreation, TreePeople, plus two near-duplicate discovery cards for Bob Baker Marionette
Theater and Discovery Cube LA that already had a correctly-fixed sibling card from an earlier pass in
this same run). Then a real cluster of thirteen NYPL/BPL public library branch cards (Bloomingdale,
Hamilton Fish Park, Epiphany, 115th St, 96th St, Muhlenberg, Heiskell, 125th St, Countee Cullen,
Morningside Heights, Grand Central, 53rd St, Park Slope) — all correctly sourced from the library
systems' own `/locations` pages with correct borough guesses already. Confirmed and touched.

### Sovereign loop, continued — the NYPL/BPL library run continues, ~450 cards reviewed (2026-08-11)

Nineteen more real NYPL/BPL branch cards confirmed clean (Schomburg Center, 58th Street, Clarendon,
Yorkville, Fort Washington, Hamilton Grange, Spring Creek, East Flatbush, Brownsville, Seward Park, New
Lots, Cypress Hills, Macomb's Bridge, Kips Bay, New Amsterdam, Marcy, Gravesend, Hudson Park, Greenpoint)
plus four more internal-seed placeholders filled in. Session running total now approaching 450
`contentCards` reviewed.

### Sovereign loop, continued — two more LA region errors, one keyword collision worth flagging explicitly (2026-08-11)

Two real region MISTAKES (not just gaps) found and fixed:
- **Long Beach Public Library** was guessed `Central LA` — Long Beach is its own city, canonically
  `Gateway Cities` in this catalogue's own tables.
- **Descanso Gardens** was guessed `Central LA` — its real location, La Cañada Flintridge, is canonically
  `San Gabriel Valley`.

**Worth flagging explicitly, even though containment was already correct**: a card titled "Complete" was
matched to `ar15discounts.com/collections/complete-uppers/` — a firearms parts retailer, hit only on the
word "Complete" (likely against "Complete Playground" or similar). Already `QUARANTINED`; documented the
specific subject matter in the terminal reason rather than filing it under the generic
`placeholder_or_junk_source` label the way other collisions were, since a future reader should not have
to re-discover what kind of mismatch this was.

Confirmed clean: five real Central LA landmarks already correctly located (Griffith Observatory, The
Broad, Travel Town Museum, La Brea Tar Pits, Brooklyn Bridge Parents' own camps listing), plus two
already-well-diagnosed incomplete cards (a raw Google-search-results source, Fit4Dance NYC) needing only
a touch. Thirteen more internal-seed placeholders cleared.

### Sovereign loop, continued — 5th real create: a business blocked by a missing source, not a fake lead (2026-08-11)

**`prov-new-amsterdam-fencing-academy` created.** `cc-82b87d4d72356975493f2c9a` carried the real business
name (New Amsterdam Fencing Academy, a genuine Upper West Side fencing club) but its seed had literally
no source URL at all (`enrichmentSummary.sourceStatus: "missing_source"`) — a discovery-pipeline gap, not
evidence the business is fake. Found the operator's real domain (nyfencing.com) and corroborated the
address (302 W 91st St) via Yelp and Waze, since the domain did not render statically. Also corrected the
source card's neighbourhood (was Harlem; the real address is Upper West Side).

A run of ~22 real, well-sourced Brooklyn youth-activity leads (Gallery Players Youth Theater, Brooklyn
Waldorf School, Powerhouse Arts, Theatre for a New Audience, My Gym's two Brooklyn branches, Soccer
Shots Brooklyn South, BASIS Independent Brooklyn, Tiger Schulmann's Bay Ridge, Brooklyn Ninja Academy,
Brooklyn Bridge Park Boathouse, etc.) confirmed clean and touched.

Session totals: **5 real provider creates**, 2 live-duplicate fixes, 1 code fix, ~30 real location
corrections, and roughly 500 `contentCards` reviewed oldest-first.

### Sovereign loop, continued — a domain-hijack case resolved to a real quarantine, not a false enrichment (2026-08-11)

**`cc-5fe8f394ea334dae35949b9d` ("Trestle Art Space Kids") — a double defect, resolved without fabricating
a "kids" program.** Its original source, trestlegallery.org, is now a domain-squatted VPN-affiliate spam
site (confirmed via its own scraped `sourceTextSample`: "Best VPN Services... Flixtor UnBlocking"). Found
the real, currently-live operator at trestleartspace.org — but it turned out to be a private ARTIST STUDIO
RENTAL space ($445/month studios for adults), with no kids/youth programming anywhere on its own site. The
card's own title was likely a fabricated/mis-derived extraction. Quarantined as off-topic rather than
inventing a "kids classes" claim the real business doesn't make.

A run of 22 real, well-sourced Brooklyn/Manhattan leads (Mathnasium's four branches, Kumon's three branches,
The Little Gym Dumbo, Soccer Shots Brooklyn North, Jewish Children's Museum, Bend + Bloom Kids Yoga, Luna
Park/Coney Island, Brooklyn Italians Soccer Club, etc.) confirmed clean and touched.

**In parallel**: launched a 20-agent workflow to fetch and classify the ENTIRE remaining pending backlog
(contentCards + providers + meetupGroups not yet published or retired, ~1,750 records) into easy/
considerate/hard buckets with deep statistics, per an explicit request to scale the audit with multiple
agents. Results to follow once it completes.

### Full-sweep classification workflow completed (partial): 1,267/1,752 records, 131 flagged findings (2026-08-11)

The 20-agent classification workflow (launched to fulfil an explicit request for a multi-agent full sweep
of the pending backlog) finished with 13/20 agents succeeding — 1 blocked by an automated safety check,
6 stopped by a session usage limit. Real results, not extrapolated: of 1,267 records actually classified,
**820 easy (65%), 335 considerate (26%), 112 hard (9%)**.

**131 records (10%) carry a flagged finding**, clustering into five real patterns: 85 likely-duplicate
flags (~40 distinct pairs — e.g. Amerikick Brooklyn, Shihan Martial Arts Brooklyn, and Premier Martial
Arts Brooklyn each have a real-domain card and a wrong-domain/directory-listing twin), 27 wrong-source/
keyword-collision matches (Physique Swimming's enrichment pulled a dictionary definition of "physique";
Premier Martial Arts Brooklyn resolved to a gambling site; Seahorse Swim School Brooklyn resolved to an
unrelated Santa Cruz business), 21 location errors (Martial Arts Family Studio guessed Brooklyn against
its own Manhattan address), 7 multi-location split candidates (British Swim School spans a 4-card
cluster), and 7 rename/rebrand cases (German School Brooklyn now brands as Global School Brooklyn).
Full detail published as an artifact; report and reasoning preserved in this repo's commit history via
this entry.

**A security disclosure, not a finding about the catalogue**: the workflow's design embedded the live
`CARD_BRIDGE_API_KEY` directly in each classification agent's prompt so agents could fetch their own data
slice. That key is now persisted in plaintext in the workflow's script file (redacted after the fact) and
in at least 38 subagent transcript files under this session's local project directory — not public, but
written to more places than intended. One agent run was itself blocked by an automated safety check for
exactly this reason. **Recommended: rotate `CARD_BRIDGE_API_KEY`**, the same caution already applied to
the MongoDB credential earlier this session. The lesson for next time: fetch data in the orchestrating
turn and hand agents only the already-fetched, credential-free records to classify — the approach the
very first attempt at this workflow used, before an unrelated args-passing bug forced a rewrite that
introduced this exposure.

### Executing the "easy" contentCards bucket: 640 of 663 resolved, real judgment applied per record (2026-08-11)

Acted on the classification workflow's 663-record "easy" contentCards bucket rather than treating the
bucket label as a single mechanical action. Splitting by the workflow agent's own `reason` text first,
then re-checking each record against the live database before writing, turned up two things worth
recording so the pattern is recognized faster next time.

**573 records were genuinely clean** — the agent's own reason said "confirmed clean" or equivalent — and
were touch-confirmed (empty update, `lastReviewedAt`/`lastReviewedBy` stamped) in three resumable batches
to work around the shell tool's 2-minute execution limit. All 573 succeeded.

**"Easy = quarantine" was the agent's default framing for the rest, and it was wrong often enough to be
worth checking every time.** Of the 68 remaining records the agent flagged toward quarantine:

- 14 known franchise/chain cards (Tiger Schulmann's, NY Kids Club, The Little Gym, Soccer Shots, Kids in
  Sports, West Side YMCA, Chelsea Piers Field House, McCarren Tennis Center) already had a confirmed real
  domain from earlier in this same session — applying the real `sourceUrl` fixed them outright instead of
  discarding a resolvable lead. 2 more were false positives from a keyword-substring check ("not squatted"
  matched on "squat") and needed only a touch-confirm.
- Of the remaining 54, live re-fetch showed **16 already sitting correctly at `BLOCKED_REPAIRABLE`** with
  a keyword-collision source and a real underlying entity (Wikipedia/Merriam-Webster/nytimes.com/amazon.com
  matches on a common word in the business's own name) — quarantining these would have discarded real,
  repairable businesses on the strength of a bad source pick alone. 11 were touch-confirmed as already
  correct; **10 more were still sitting in `DISCOVERED` carrying the same collision pattern (several with
  a wrongly-applied `policy_or_safety_review`)** and were moved to `BLOCKED_REPAIRABLE` with
  `policy_or_safety_review` dropped and `terminalReason` rewritten to name the actual keyword collision —
  same fix pattern as the `constitution.congress.gov` / 14th Street Y and `en.wikipedia.org` / Downtown
  United Soccer Club cases earlier in this document, just not yet applied to these ten.
- **18 were the "seed card" duplicate class** (`internal://classscout/source-seed/…` or a bare
  `google.com` maps-link placeholder, `sourceHost: "classscout"`) — checked one at a time by title/name
  against the live database rather than assumed resolved. All 18 had a real, already-resolved sibling
  elsewhere: Brooklyn Italians Soccer Club, Tiger Strong NYC (×2 stub cards), Brooklyn Martial Arts, and
  Park Slope United Soccer Club each had a `PUBLISHED` sibling; several more (Central Park Tennis Center
  Youth, Downtown Soccer League NYC, Playgarden Prep ×2, Hoop Heaven, Mind Over Matter Fitness) had a
  `BLOCKED_TERMINAL` sibling on the real domain; a few (Imagine Swimming Brooklyn Heights, Fun Clubs
  Brooklyn Camps, Brains & Motion Education Brooklyn, Advantage QuickStart Tennis) had a `QUARANTINED`
  sibling; New Amsterdam Fencing Academy's real domain (nyfencing.com) had already been captured as a new
  `providers` record (`prov-new-amsterdam-fencing-academy`, published) in an earlier batch, just never
  closed out on this stub. All 18 were moved to `BLOCKED_TERMINAL` citing the sibling id, rather than
  `QUARANTINED` — quarantine implies the record itself is wrong; these are dead stubs superseded elsewhere.
  **One (Physique Swimming Battery Park City) had no confirmed real sibling** and was left untouched —
  genuinely not an easy win, needs its own research pass.
- The true remaining junk — 14 records whose own *title* was the scraped garbage page itself (Aliexpress,
  an Ipswich Town fan-news page, a mail-order-bride site, xnxx.es, a Chinese Q&A dictionary page, etc.),
  every one of them also carrying **fabricated Bronx borough/neighborhood metadata** with no connection to
  the actual (nonexistent) entity — were quarantined with `categoryHint`/`boroughGuess`/`neighborhoodGuess`
  cleared, matching the "worst-case off-topic-contamination" fix pattern already established in this
  document.

**Net for this batch: 53 writes, 53 successes, 0 quarantines applied to a record that turned out to have a
real, resolvable entity behind it.** Left deliberately out of scope: the 22 `MAPS_LINK` records (real,
resolvable businesses via a Google Maps place-link, not junk — belongs in a `considerate` pass) and the one
unresolved Physique Swimming record. The 157-record providers "easy" bucket has not yet been started.
