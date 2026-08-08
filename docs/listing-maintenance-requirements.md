# ClassScout listing-maintenance requirements — and what this bridge can actually store

**Source: the core system's listing-maintenance spec, handed to this repo 2026-08-08.** That spec is the
authority on *what a reviewer should look for and collect*. This file records it, and then does the thing
the spec itself cannot: says field by field **which parts this bridge can persist today, which parts it can
only record as prose, and which parts need schema work in the read-only main app.**

Read this alongside `card-improvement-process.md` (the operating procedure) and
`classscout-core-recommendations.md` (the developer handoff). Where the spec and this repo's own
accumulated rules agree, the spec wins as the statement of intent; where this repo has learned something the
spec doesn't mention, that stays.

---

## The framing, kept verbatim because it is the point

> Your reader is a parent deciding where to take their child on Saturday. **Everything below follows from
> that.** A wrong address costs them a trip. A stale price costs them trust. A closed registration they
> learn about after arriving costs you the family entirely.

## The rule that outranks the others

**Search for the entity, not the domain.** Four defect shapes are indistinguishable until you look up the
business itself: never real; a domain that never belonged to it; a domain that did and has since expired;
and a domain belonging to a *different real company sharing a word*.

This repo reached the same rule independently and has the scar tissue to match — see the token-collision,
domain-hijacking and token-match entries in `CLAUDE.md`. Two worked examples now sit on either side of it:
the spec's **Camp Kidville / `camp.com`** case, and this repo's **Zing! for Kids / `zing.cz`** case, where
the card's domain was a Czech video-games magazine and the business was a real Upper East Side studio.
Both would have been deleted by judging the domain.

### The two negative controls — do not "fix" either

1. **A foreign domain that is the entity's own.** `goethe.de` for Goethe-Institut New York is correct.
2. **A subject mismatch inside one organization.** "NYC Skyline Flag Football" on
   `nycskylinebasketball.com` is one org running several sports. A mismatch matters when the **entities**
   differ, not the subjects.

---

## Part 1 — the defect patterns, and this repo's status on each

| # | Pattern | Storable here? | Status in this repo |
| --- | --- | --- | --- |
| 1.1 | Location inferred from a homepage, not read | **Yes** — `boroughGuess`/`neighborhoodGuess`, `providers.address`/`borough`/`neighborhood` | Independently found and named the *root-domain defect predictor*; five-for-five in one batch |
| 1.2 | One page, several businesses | **Yes** — `state` | Handled repeatedly (Psychology Today, ActivityHero browse hubs, `/in/new-york-ny`) |
| 1.3 | Same business, several times | **Yes** — `state`, plus `POST /split` | The bulk of this session: 50+ hosts reconciled |
| 1.4 | Program pages became location listings | **Yes** — `state` | Named independently, including the URL-depth trap |
| 1.5 | Names that are not names | **Yes** — `title` | Found "New", "And", "Summer", "Browse", plus `<br>` markup and `: family_service_review_required` |
| 1.6 | **Prices that are not prices** | **NO** — no price field exists in this bridge | Cannot act. See gaps below |
| 1.7 | Ages / schedules / images unconfirmed | **Partly** — `providers.ageRanges` (buckets), `recurringPrograms`, `image` | Not yet worked; `contentCards` has none of these |
| 1.8 | Places outside New York City | **NO** — no `outOfMarketLocation` field | Confirmed **5×** (Fort Lee NJ, Huntington LI, Westchester/New Canaan, Centereach/Farmingdale/Garden City, Montauk) and the data is already violating the type: cards exist with `boroughGuess: "Long Island"` and `"NYC / Long Island"` |
| 1.9 | Internal vocabulary in a place field | **Yes** — the place fields are writable | Found "Near Manhattan priority zones", "NYC-wide", "Multiple", "Mobile / Brooklyn" |

**The spec's §1.6 price finding — 97.3% of the catalog priced at zero — is the single most important item
in it, and it is the one this bridge is least able to touch.** There is no price field in either writable
collection. Nothing a reviewer learns about price can be persisted here except as prose in
`terminalReason`.

---

## Part 2 — what to collect, mapped to what can be stored

### Storable today

| Spec field | Bridge field | Collection |
| --- | --- | --- |
| address | `address`, `addressNormalized`, `addressComponents`, `addressConfidence`, `geo` | `providers` |
| phone | `phone` | `providers` |
| email | `email` | `providers` |
| description / copy | `shortDescription`, `longDescription` | `providers` |
| schedule (coarse) | `recurringPrograms` | `providers` |
| ages (buckets only) | `ageRanges` | `providers` |
| activity / category | `category`, `activityTypes`, `primaryActivityType`, `categoryHint` | both |
| location | `borough`, `neighborhood` / `boroughGuess`, `neighborhoodGuess` | both |
| official image | `image` | `providers` |

### NOT storable — needs core-app schema work

`sessions[]` (title, start/end dates, **registrationOpensAt / registrationClosesAt**, registrationStatus,
registrationUrl, spotsRemaining) · `price{}` with its `evidence` enum · `ageMinMonths` / `ageMaxMonths` ·
`venueModel` · `inclusion{}` · `trialPolicy{}` · `fieldVerifications[]` · `outOfMarketLocation`.

Every one of these is written up in `classscout-core-recommendations.md` as the corresponding
recommendation. Until they exist, a reviewer working through this bridge should **record the finding
verbatim in `terminalReason`** — that is the documented fallback, and it is what keeps a future pass from
re-researching from scratch.

### Two of these matter more than the rest, for reasons this repo can corroborate

**`venueModel` would resolve the single most common judgement call in this whole effort.** Nearly every
hard case has been "does this operator have a venue, and whose is it?" — Physique Swimming's seven host
pools (kept), The Art Farm's rented camp hall (retired), Steve & Kate's rented campuses (kept, because it
has no other venue), Brooklyn Robot Foundry's studio-plus-mobile (kept, mobile framing stripped), Super
Duper Tennis's no courts at all (retired). Those are five different answers to one question that the data
model cannot currently ask. `own_premises · host_sites · in_home · online · outdoors · unknown` would
capture it directly.

**`ageMinMonths`/`ageMaxMonths`** — the spec's "a parent with a 20-month-old gets sent to a class for
four-year-olds" is exactly right, and `providers.ageRanges` buckets cannot express it.

---

## Part 3 — the four verdicts, adopted

The spec's verdicts map onto this bridge's `state` values, and adopting its vocabulary is worth it because
`needs_human` has no equivalent here and should have one.

| Verdict | What it means | Bridge action |
| --- | --- | --- |
| `confirmed` | Checked, and right. **Name the fields checked** — a confirmation of nothing in particular is not a confirmation | Touch write, fields listed in `reason` |
| `corrected` | Better values found | Apply, with current + proposed both in `terminalReason` |
| `needs_human` | Genuinely ambiguous. **Use freely** | `BLOCKED_REPAIRABLE` + the question stated |
| `should_not_exist` | Aggregator page, program page, duplicate, or no evidence the business exists | `BLOCKED_TERMINAL`, or `QUARANTINED` on a reality-check failure |

**`needs_human` is the addition this repo most needed.** Its nearest existing behaviour was the "deliberate
non-action" — five of them so far (City Parks Foundation, Five Points Academy, Fit Soccer Kids, NYC Impact
Volleyball, NYC Juniors Volleyball), each left vague on purpose because a specific value would have been
*less* true. Those were recorded in prose. They are `needs_human`, and naming them that makes them
countable.

### The reporting rules, adopted verbatim

1. Never invent. 2. Never round a price into a different unit. 3. Never guess a location. 4. Quote, don't
paraphrase, in `sourceText`. 5. Flag your own uncertainty. 6. **A listing that has not changed is a
result** — silence is indistinguishable from not having looked.

Rule 6 is already this repo's `touch` convention, and rule 2 is new here and worth stating twice: **"$625
for the 8-week term" is `{amount: 625, unit: "term"}`, not $78/class.** The parent pays 625.

---

## Where this repo's own loop currently falls short of the spec

Stated plainly, because the gap is real and was found by being asked directly:

1. **This session has written to `contentCards` only — 239 writes, zero to `providers`.** Every
   contact-data and content-quality field the spec cares about (address, phone, email, descriptions,
   schedule, ages, image) lives on `providers`. The loop has been fixing identity and location on
   pre-publish cards and has not touched the collection where enrichment actually happens.
2. **`categoryHint` was left null on every card of three maintenance runs** despite being writable and
   explicitly named in the standing content-quality directive. Backfilled on 10 cards once noticed; the
   miss is recorded rather than quietly corrected.
3. **No `fieldVerifications` equivalent exists**, so a single freshly-checked fact still makes a whole
   stale record look current — the exact problem the spec names.

The fix for (1) is a change to step 1 of the loop: pull the oldest across `providers` as well as
`contentCards`, which the SOP has always said and the practice has drifted from.
