# Structured opening hours, programs and sessions — recommendation

**Status: the bridge half is BUILT and migrated (see §9); the core-app half is a recommendation.**
Owner-requested 2026-08-08: *"I would like to store them in
structured format to be able to have a kind of menu for the listings and also can be used to find
activities better for actual days."*

Read with `docs/listing-maintenance-requirements.md` (the core system's own spec) and
`docs/classscout-core-recommendations.md` §0b, which already asks for `price{}`, `sessions[]`,
`ageMinMonths/MaxMonths`, `venueModel` and `fieldVerifications[]`. **This document is the concrete schema
for those items plus opening hours, designed against what the live data actually contains.**

---

## 1. The one measurement that frames the whole thing

Across the 830 programs on live listings today:

| | count | share |
| --- | ---: | ---: |
| programs with a `daysOfWeek` | 511 | 62% |
| programs with any `timeText` | 512 | 62% |
| `timeText` containing a clock time | 398 | 48% |
| `timeText` containing a **start AND end** time | 229 | 28% |
| **day + start + end together — the minimum to answer "what's on Friday at 5pm"** | **226** | **27%** |

So the feature the owner is asking for is currently answerable for about a quarter of programs, and not
because the facts are missing — because **`timeText` is prose**. `"Mon/Thu 4:30-6:00 PM; Tue 3:30-5:00 PM;
Sat 9:00-10:30 AM"` is a real, excellent value that no query can use.

**114 of the `timeText` values contain no clock time at all**, and most of those are honest: `"Weekend
schedule"` (58), `"Weekday schedule"` (33), `"See official schedule"`. Those are not defects to parse
away — they are providers who genuinely do not publish times, and the model must be able to say so.

## 2. What already exists (and is barely used)

`providers.recurringPrograms[]` is already a sub-document array with a usable skeleton. Population, of 882
program entries:

| sub-field | populated | verdict |
| --- | ---: | --- |
| `title`, `cadence` | 882 | `cadence` should be **retired** — see below |
| `activityTypes` | 858 | keep; the taxonomy rules now apply here |
| `ageRanges` | 716 | keep as display, **add numeric months** |
| `timeText` | 557 | keep as display, **add machine fields** |
| `daysOfWeek` | 532 | keep — already correct |
| `summary` | 394 | keep |
| `registrationUrl` | 88 | keep, extend to a `registration{}` block |
| `locationNote` | 57 | keep — relates to `venueModel` |
| `isDropIn` | 15 | keep |
| `priceText` | **11** | keep as `sourceText` inside a real `price{}` |
| `startDate` / `endDate` | **4** | keep — critical for camps |

Two problems in what exists:

- **`cadence` is 39% non-answer.** Values: `Custom` **348**, `Weekends` 248, `Weekly` 216, `Weekdays` 66,
  `Seasonal` 2, `Monthly` 2. `Custom` is the pipeline saying it could not classify — the same defect class
  as `Multi-category` and `no category`, already banned elsewhere. And `Weekends`/`Weekdays` merely restate
  `daysOfWeek`, worse. Replace with a real recurrence rule; keep nothing.
- **`ageRanges` is five buckets** (`0–2 / 3–5 / 6–8 / 9–12 / Teens`). The owner's own example — *"Age for
  the program 8-12"* — **cannot be expressed**: it straddles `6–8` and `9–12`. Rounding outward sends a
  parent of an 8-year-old to a class that starts at 9.

## 3. Anchor to a standard rather than inventing one

Two bodies of prior art fit this domain exactly, and using their names costs nothing while buying search
visibility and future interoperability:

- **schema.org** — [`OpeningHoursSpecification`](https://schema.org/OpeningHoursSpecification)
  (`dayOfWeek`, `opens`, `closes`, `validFrom`, `validThrough`) and
  [`Schedule`](https://schema.org/Schedule) (`byDay`, `repeatFrequency`, `startTime`, `endTime`,
  `scheduleTimezone`, `exceptDate`). These are what Google consumes for "open now" and event rich results.
- **[OpenActive](https://developer.openactive.io/data-model/types/sessionseries)** — the open standard for
  *bookable physical-activity sessions*, which is precisely this catalogue's focus. Its central idea is the
  one to copy: a **`SessionSeries`** (the recurring offering) and a **`ScheduledSession`** (a specific dated
  instance), with the instance inheriting from the series unless it overrides. It also models
  `ageRange` as a numeric `minValue`/`maxValue`, and carries `eventStatus` for cancellations.

Two details from OpenActive worth stealing outright: an **unspecified age range has a defined default
meaning** (they assume adults), which is a good reminder that absence must be declared rather than left
ambiguous; and **`level`** (beginner/intermediate/advanced), which matters a lot for sport and is not
currently captured anywhere.

## 4. Recommended model — three levels, deliberately separated

### Level 1 — the venue is open

```jsonc
"openingHours": [
  { "daysOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
    "opens": "09:00", "closes": "18:00" },          // 24h local time, HH:MM
  { "daysOfWeek": ["Saturday"], "opens": "10:00", "closes": "16:00" },
  { "daysOfWeek": ["Sunday"], "closed": true }       // explicit, not omission
],
"openingHoursSeasonal": [
  { "daysOfWeek": ["Monday"], "opens": "08:00", "closes": "20:00",
    "validFrom": "2026-06-22", "validThrough": "2026-08-28" }   // summer hours
],
"specialHours": [
  { "date": "2026-12-25", "closed": true, "note": "Christmas Day" }
],
"timezone": "America/New_York",
"openingHoursEvidence": { "sourceUrl": "...", "sourceText": "Mon–Fri 9am–6pm", "observedAt": "2026-08-08" }
```

**Opening hours are NOT class times, and conflating them is already happening.** Brooklyn Sports Club's
program `timeText` reads `"6 AM - 10 PM"` — that is the facility's door hours sitting in a field a parent
reads as "when is my child's class". A separate field is the fix.

### Level 2 — the program (the recurring offering)

This is the owner's "Friday open soccer" example, and it is the "menu" for a listing.

```jsonc
{
  "id": "prov-x-friday-open-soccer",
  "name": "Friday Open Soccer",
  "format": "Drop-In Activities",           // the FORMAT dimension
  "activityTypes": ["Soccer", "Sports"],    // the ACTIVITY dimension, existing rules apply

  "schedule": {
    "repeatFrequency": "P1W",               // ISO-8601 duration — weekly
    "byDay": ["Friday"],
    "startTime": "17:00",                   // local, 24h
    "endTime": "20:00",
    "timezone": "America/New_York",
    "validFrom": "2026-09-05",              // term / season window (null = year-round)
    "validThrough": "2026-12-19",
    "exceptDates": ["2026-11-27"],          // holidays, closures
    "precision": "exact"                    // exact | day_only | vague | unknown
  },

  "ageMinMonths": 96,                       // 8 years   -- numeric, not buckets
  "ageMaxMonths": 155,                      // 12 years 11 months
  "ageText": "Ages 8–12",                   // provider's own words, for display

  "price": {
    "evidence": "stated",                   // stated | stated_free | from | unknown
    "amount": 12,
    "currency": "USD",
    "unit": "per_person_per_session",
    "sourceText": "$12 / person",
    "variants": [ { "label": "Member", "amount": 10 } ]
  },

  "capacity": { "max": 25, "unit": "children" },

  "registration": {
    "required": false,
    "status": "open",                       // open | closed | waitlist | not_required | unknown
    "url": null,
    "opensAt": null, "closesAt": null
  },

  "level": "all",                           // all | beginner | intermediate | advanced
  "description": "An open soccer game every Friday. No registration required; capacity 25 children.",
  "locationNote": null,                     // when the program runs somewhere other than the main venue
  "evidence": { "sourceUrl": "...", "sourceText": "...", "observedAt": "2026-08-08" }
}
```

### Level 3 — materialised sessions (what makes "what's on today" fast)

A recurrence rule cannot be indexed usefully in MongoDB. Expand the rules into dated rows, on a rolling
horizon (90 days is plenty), and query those. This is exactly OpenActive's `ScheduledSession`.

```jsonc
{ "providerId": "...", "programId": "...",
  "startsAt": "2026-09-05T21:00:00Z",       // UTC — DST resolved at expansion time
  "endsAt":   "2026-09-06T00:00:00Z",
  "localDate": "2026-09-05", "dayOfWeek": "Friday",
  "status": "scheduled",                     // scheduled | cancelled | postponed
  // denormalised for a single-index query:
  "borough": "Brooklyn", "neighborhood": "Gowanus", "geo": {...},
  "activityTypes": ["Soccer","Sports"], "ageMinMonths": 96, "ageMaxMonths": 155,
  "priceAmount": 12, "isFree": false, "isDropIn": true }
```

Index `{ startsAt, borough }` and a geospatial index on `geo`. "Free drop-in soccer near me this Saturday
for a 9-year-old" becomes one query. Regenerate nightly and on write; never hand-edit a session — the rule
is the source of truth.

## 5. Six rules that must be built into the schema, not left to reviewers

Each of these is a defect this repo has already paid for.

1. **Absence is a value.** Every block needs an explicit unknown. **Never a default that means something.**
   The core spec's headline finding is 97.3% of the catalogue priced at zero, because the price field
   defaults to `0` and cannot distinguish *free* from *not found*. Hence `price.evidence` with `amount`
   **omitted** when unknown — the single most important field in this document.
2. **Unit discipline.** `"$625 for the 8-week term"` is `{625, "term"}`, never `$78/class`. The real
   `priceText` values in the data are genuinely this complex: *"$55 per 30-minute lesson; $74 per 60-minute
   lesson"*, *"$1,115 community / $1,028 Y member per two-week session"*, *"Free with admission"*. A single
   number cannot hold them, which is why `sourceText` and `variants` exist.
3. **Evidence per field, not per record.** `{sourceUrl, sourceText, observedAt}` on each block. Today one
   freshly-checked phone number refreshes a whole-record timestamp and makes a stale listing look current.
4. **Quote, never infer.** `sourceText` holds the provider's own words. A parser may propose `startTime`;
   the quote is what a human checks it against.
5. **Precision is a value too.** `schedule.precision: "vague"` is the honest home for the 58 `"Weekend
   schedule"` values. Better a listing that says "weekends, times not published" than one that invents 10am.
6. **Timezone explicitly, times stored local.** Store `17:00` + `America/New_York`; resolve to UTC only when
   materialising sessions. Storing UTC directly breaks twice a year.

## 6. What can start immediately, and what needs the core app

**`providers.recurringPrograms` is writable through this bridge and has NO shape validation** — it is
written as a whole array, so the program sub-schema in §4 Level 2 can be adopted **today, without any
core-app change**. The core app would ignore unknown sub-fields until it learns to render them, but the
data would be captured, queryable, and no longer need re-researching.

That is also a gap by this repo's own convention — *"never add a bare passthrough field"*. If the sub-schema
is adopted, it needs a validator alongside it (times well-formed, `ageMinMonths ≤ ageMaxMonths`, price unit
in the enum, `exceptDates` real dates).

| Item | Where it can live |
| --- | --- |
| program `schedule{}`, `price{}`, `capacity{}`, `registration{}`, `ageMinMonths/MaxMonths`, `level`, per-field `evidence` | **This bridge, now** — inside `recurringPrograms[]` |
| `openingHours` / `specialHours` / `timezone` | **Core app** — new provider-level fields |
| materialised `sessions[]` collection + indexes | **Core app** — new collection and a nightly job |
| `venueModel`, `outOfMarketLocation`, `fieldVerifications[]` | **Core app** — already recommendation §0b |

## 7. Migration, honestly

- **~226 programs (27%)** already have day + start + end and can be converted mechanically.
- **~172 more** have a clock time but no end time — derivable to `precision: "day_only"` plus a start.
- **114** say "Weekend schedule" or similar — these become `precision: "vague"`, which is a correct answer,
  not a gap to fill.
- **318 programs have no `timeText` at all** — research, and the honest interim value is `unknown`.

Do not backfill by guessing. The value of this schema comes from the `evidence` fields; a structured
schedule with an invented start time is worse than the prose it replaced, because it looks authoritative
and it is queryable.

## 8. Two things worth adding that were not asked for

- **`level`** (beginner/intermediate/advanced). OpenActive carries it, and for sport it is often the
  deciding fact — a 10-year-old who has never played is not served by a competitive travel-team tryout.
- **`registration.opensAt` / `closesAt`.** The core spec calls this the most useful thing a reviewer can
  find that has nowhere to be stored, and *"summer camp registration opens next month"* is the strongest
  reason a family comes back to the product rather than visiting once.

---

Sources for the standards referenced: [schema.org/Schedule](https://schema.org/Schedule) ·
[schema.org/OpeningHoursSpecification](https://schema.org/OpeningHoursSpecification) ·
[OpenActive SessionSeries](https://developer.openactive.io/data-model/types/sessionseries) ·
[OpenActive ScheduledSession](https://developer.openactive.io/data-model/types/scheduledsession) ·
[OpenActive Offer](https://developer.openactive.io/data-model/types/offer)

---

## 9. Status — the bridge half is built and migrated (2026-08-08)

**Built:** `src/lib/delivery/programSchema.ts` (schema, vocabularies, validator, month↔bucket conversion,
a conservative `parseTimeRange`), wired into `validateWriteRequest` so `recurringPrograms` is no longer a
bare passthrough, plus derivation of the display age buckets from the numeric months on every write. 34
tests; 263 in the suite.

**Migrated, from facts already on the records — nothing researched, nothing invented:**

| | before | after |
| --- | ---: | ---: |
| programs with a structured `schedule{}` | 0 | **512** of 830 |
| …`precision: "exact"` (day + session time) | 0 | **121** |
| …`precision: "day_only"` | 0 | **390** |
| programs with numeric `ageMinMonths/MaxMonths` | 0 | **434** |

**The migration's most important decision was to assert LESS than it could.** A naive pass produced 223
"exact" windows. Measuring them showed 73 were longer than eight hours — `"8:30 AM-9:00 PM"`, `"9am-9pm"` —
which are the building's door hours scraped into the field a parent reads as *when is my child's class*.
The rule now caps a plausible session at 4 hours (8 for camps, which really do run that long), and above
that keeps the DAY while refusing to assert a time, flagged `timeTextLooksLikeVenueHours` for a research
pass. **103 programs were flagged rather than converted.** Precision the data has not earned is worse than
the prose it replaced, because it is queryable.

Ages were derived from the existing buckets to their widest honest span and marked
`ageDerivedFromBuckets: true`, so a later research pass can tell a derived range from a verified one.
