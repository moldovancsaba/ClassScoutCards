# Copiable prompt for the core `classscout` developer agent

Everything between the rules below is the prompt. Paste it whole into an agent working in the
**`moldovancsaba/classscout`** repository.

---

You are working in the **`classscout`** core application. A sibling repository, `classscoutcards`, runs a
read/write bridge over the same MongoDB database (`classscoutcluster`) and has spent a long maintenance
effort auditing and repairing this catalogue's live data. It has already built its half of the change
described below. Your job is the half that only the core app can do.

**Read these first** (they are in the `classscoutcards` repo, and you should read them, not skim them):

- `docs/structured-schedule-recommendation.md` — the full design, with the measurements behind it.
- `docs/classscout-core-recommendations.md` — every defect found in this app's pipeline, ordered by family
  impact. Items §0b, §8 and §9 overlap with this task.
- `docs/listing-maintenance-requirements.md` — the field-by-field map of what can and cannot be stored.

## The goal, in one sentence

A family should be able to ask **"what's on this Friday at 5pm near me, for my 9-year-old, that's free"**
and get a correct answer — which today is impossible, because schedules are stored as prose.

## What is already true (do not redo it)

The bridge repo has already, against live data:

- Defined the program sub-schema in `src/lib/delivery/programSchema.ts` — vocabularies, a validator, and
  conversions between numeric ages in months and the five legacy display buckets.
- Closed the `recurringPrograms` bare-passthrough hole: malformed programs are now rejected at write time.
- Migrated **512 of 830 live programs** to a structured `schedule{}` (121 `exact`, 390 `day_only`) and
  **434** to numeric `ageMinMonths`/`ageMaxMonths`, built only from facts already on the records.
- Established the activity taxonomy the catalogue now uses: FORMAT (`Classes`, `Camps`, `Birthday Parties`,
  `Drop-In Activities`) and ACTIVITY (`Soccer`, `Art`) are **separate dimensions**; a sport listing reads
  `<specific sport>, Sports`; when any sport is present all non-sport tags are dropped.

So `providers.recurringPrograms[]` entries in the database now look like this, and more will follow:

```jsonc
{
  "id": "…", "title": "Friday Open Soccer",
  "activityTypes": ["Soccer", "Sports"],
  "daysOfWeek": ["Friday"], "timeText": "Fridays 5–8pm",   // legacy, still present
  "schedule": {
    "repeatFrequency": "P1W", "byDay": ["Friday"],
    "startTime": "17:00", "endTime": "20:00",
    "timezone": "America/New_York",
    "validFrom": "2026-09-05", "validThrough": "2026-12-19",
    "exceptDates": ["2026-11-27"],
    "precision": "exact"                    // exact | day_only | vague | unknown
  },
  "ageMinMonths": 96, "ageMaxMonths": 155, "ageDerivedFromBuckets": true,
  "ageRanges": ["6–8", "9–12"],             // DERIVED from the months — never authored by hand
  "price": { "evidence": "stated", "amount": 12, "currency": "USD",
             "unit": "per_person_per_session", "sourceText": "$12 / person",
             "variants": [{ "label": "Member", "amount": 10 }] },
  "capacity": { "max": 25, "unit": "children" },
  "registration": { "required": false, "status": "not_required",
                    "url": null, "opensAt": null, "closesAt": null },
  "level": "all",
  "evidence": { "sourceUrl": "…", "sourceText": "…", "observedAt": "2026-08-08" }
}
```

## Your tasks

### 1. Render the structured program data (highest value, smallest change)

The card's "Recurring programs" block currently prints `timeText` verbatim. Read `schedule{}` when present
and fall back to `timeText` when it is not. **Respect `precision`:** render a time range only for `exact`;
for `day_only` render the days alone ("Fridays"); for `vague`/`unknown` render whatever prose exists, or
nothing. Never print a start time the data does not claim.

Also render, when present: the price (per its `unit` — see the price rules below), the age range from
`ageMinMonths`/`ageMaxMonths`, capacity, and registration status.

### 2. Add venue opening hours — new `providers` fields

Opening hours are **not** class times, and the two are already being conflated in live data (a program
`timeText` reading `"6 AM - 10 PM"` is the building's door hours). Give them their own fields, named after
schema.org's `OpeningHoursSpecification`:

```jsonc
"openingHours": [
  { "daysOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "09:00", "closes": "18:00" },
  { "daysOfWeek": ["Sunday"], "closed": true }        // explicit closure, not an omission
],
"openingHoursSeasonal": [ { "daysOfWeek": ["Monday"], "opens": "08:00", "closes": "20:00",
                            "validFrom": "2026-06-22", "validThrough": "2026-08-28" } ],
"specialHours": [ { "date": "2026-12-25", "closed": true, "note": "Christmas Day" } ],
"timezone": "America/New_York",
"openingHoursEvidence": { "sourceUrl": "…", "sourceText": "Mon–Fri 9am–6pm", "observedAt": "2026-08-08" }
```

Then **add these to the card-bridge's writable allow-list** in the sibling repo
(`src/lib/delivery/cardBridgeRegistry.ts`) with a validator, so the maintenance loop can populate them.
Coordinate that change; do not leave them write-only from your side.

### 3. Build the sessions index — this is what makes per-day search possible

A recurrence rule cannot be usefully indexed in MongoDB. Expand the rules into dated rows.

```jsonc
// new collection: classscoutSessions
{ "providerId": "…", "programId": "…",
  "startsAt": "2026-09-05T21:00:00Z", "endsAt": "2026-09-06T00:00:00Z",   // UTC
  "localDate": "2026-09-05", "dayOfWeek": "Friday",
  "status": "scheduled",                          // scheduled | cancelled | postponed
  "precision": "exact",
  // denormalised so one index answers the whole query:
  "borough": "Brooklyn", "neighborhood": "Gowanus", "geo": { … },
  "activityTypes": ["Soccer","Sports"], "primaryActivityType": "Soccer",
  "ageMinMonths": 96, "ageMaxMonths": 155,
  "priceAmount": 12, "priceUnit": "per_person_per_session", "isFree": false,
  "priceEvidence": "stated", "isDropIn": true }
```

- Expand on a rolling **90-day horizon**; regenerate nightly and on write.
- Index `{ startsAt: 1, borough: 1 }` and a `2dsphere` on `geo`.
- Honour `exceptDates`, `validFrom`/`validThrough`, and `status`.
- **Only expand programs whose `precision` is `exact` or `day_only`.** A `day_only` session gets a date and
  no time — it can answer "what's on Friday" but must not appear in a "5pm" filter.
- **Never hand-edit a session.** The rule is the source of truth; a session is a cache.
- Resolve DST at expansion time. Store `startTime` local + IANA timezone on the rule; UTC only here.

### 4. Fix the price model — the single highest-value item in this document

Your own listing-maintenance spec reports **97.3% of the catalogue priced at zero**, because the price
field is required and defaults to `0`, so *genuinely free* and *never found* are indistinguishable. Replace
the scalar with the object above. Non-negotiable rules, all enforced in the bridge's validator already:

- `evidence: "unknown"` → `amount` **omitted**. Never `0`, never a default.
- `evidence: "stated_free"` → the listing is genuinely free.
- An `amount` always requires a `unit`. **"$625 for the 8-week term" is `{625, "per_term"}`, never
  $78/class** — dividing a stated price invents a number the provider never published.
- `sourceText` holds the provider's own words verbatim. Real stored values are this complex: *"$55 per
  30-minute lesson; $74 per 60-minute lesson"*, *"$1,115 community / $1,028 Y member per two-week
  session"*, *"Free with admission"*.

Migrate the existing scalar as `evidence: "unknown"` unless the record has real evidence of being free.
**Do not migrate `0` to "free".** That is the bug.

### 5. Ages in months at the provider level too

Add `ageMinMonths`/`ageMaxMonths` alongside the five buckets and **derive the buckets from the months**, the
way the bridge already does for programs. The buckets alone cannot express "ages 8–12" — it straddles `6–8`
and `9–12`, so rounding outward sends a parent of an eight-year-old to a class that starts at nine.

### 6. Fix the two upstream pipeline bugs that produced this mess

Both are documented with evidence in `classscout-core-recommendations.md`:

- **§0 — discovery picks a source by token-matching one word of the business name to an unrelated famous
  page.** 25+ live cards, most `PUBLISHED`: `en.wikipedia.org/wiki/Tiger` for Tiger Schulmann's,
  `/wiki/Saint_Peter` for Peter Stuyvesant Little League, `zing.cz` (a Czech video-games site) for Zing!
  for Kids, `camp.com` for Camp Kidville. This is the root cause of a large share of the junk in
  `timeText` and `shortDescription`, because the copy was scraped from those pages.
- **Page furniture is being scraped into content fields.** 276 `recurringPrograms[].timeText` values held
  "skip navigation", menu bars, staff bios, testimonials and contact emails; 74 records had an LLM prompt
  published as their description. The extractor needs to reject navigation/boilerplate before storing.

### 7. Retire `cadence`

39% of its values are `"Custom"` — the pipeline recording that it could not classify, the same defect class
as `no category` and `Multi-category`, both already banned. The rest (`Weekends`, `Weekdays`) merely restate
`daysOfWeek` less precisely. Once `schedule{}` is populated, drop the field.

## Rules that must hold in everything you build

Each one is a defect this catalogue has already paid for. They are not style preferences.

1. **Absence is a value; a placeholder is not.** Never a default that means something. If a fact was not
   found, the field is absent or explicitly `unknown`. This is the rule the price bug broke.
2. **Never invent, never infer, never round.** Store the provider's own words in `sourceText` next to any
   parsed value.
3. **Precision is itself data.** `day_only` and `vague` are correct answers. A structured schedule with a
   guessed start time is *worse* than the prose it replaced, because it looks authoritative **and** it is
   queryable.
4. **Evidence per field, not per record.** One freshly-checked phone number must not refresh a whole-record
   timestamp and make a stale listing look current. Add `fieldVerifications[]`
   (`{field, verifiedAt, sourceUrl, method, verifiedBy}`).
5. **Derive, don't trust.** Anything computable from another field (display age buckets from months, the
   `Sports` parent from a specific sport) is derived on write, so the two can never disagree.
6. **A guard that deletes what it does not recognise inverts the cost of an incomplete list.** If you add a
   rule that drops unrecognised values, re-audit every vocabulary it consults first.
7. **Verify by re-reading the database, not by parsing the write response.** In this project, writes have
   returned success and changed nothing.

## Acceptance criteria

- A query returns every program running on a given date, filtered by borough or geo radius, age in months,
  activity, and free/paid — in one indexed query, with no string parsing at read time.
- No session appears at a specific time unless its program's `precision` is `exact`.
- No price renders as "free" unless `evidence` is `stated_free`. `unknown` renders as "Price not listed".
- The card's Recurring programs block renders `schedule{}` when present and falls back to `timeText`
  otherwise, with no visual regression on the 318 programs that still have neither.
- `openingHours` is populated for at least one real listing end-to-end, and is writable through the bridge.
- Regenerating the sessions collection twice produces identical output (idempotent).

## What NOT to do

- Do not backfill by guessing. 318 programs have no time information at all; the honest value is absent.
- Do not delete `timeText`, `daysOfWeek`, `ageRanges` or `priceText`. They are the display fallback and the
  audit trail for what was derived.
- Do not migrate a `0` price to "free".
- Do not treat opening hours as class times, or vice versa.
- Do not commit anything to the `classscoutcards` repo — it is maintained separately. Coordinate the
  registry/validator change there rather than pushing it yourself.

## Suggested order

1. Render `schedule{}` (immediate visible win, no schema change, unblocks review of the migrated 512).
2. `price{}` model + migration (highest value; fixes 97.3% of the catalogue).
3. `openingHours` fields + bridge writability (unblocks the maintenance loop collecting them).
4. Sessions collection + indexes (delivers per-day search).
5. Pipeline fixes §0 and the boilerplate scraper (stops new junk arriving).
6. Retire `cadence`, add `fieldVerifications[]`, `venueModel`, `outOfMarketLocation`.
