/**
 * The structured program sub-schema for `providers.recurringPrograms[]`.
 *
 * WHY THIS EXISTS (owner-requested 2026-08-08). A family should be able to ask "what's on this Friday at
 * 5pm near me". Today that is answerable for 226 of 830 live programs (27%) -- not because the facts are
 * missing, but because `timeText` is prose: `"Mon/Thu 4:30-6:00 PM; Tue 3:30-5:00 PM"` is excellent
 * information that no query can use. See `docs/structured-schedule-recommendation.md` for the full design
 * and the measurements behind it.
 *
 * WHY IT LIVES IN THIS REPO. `recurringPrograms` is writable through the card-bridge and was a BARE
 * PASSTHROUGH -- written as a whole array with no shape validation at all. That means the program half of
 * the design can be adopted here with no change to the read-only core app, and it also means this repo was
 * violating its own rule ("never add a bare passthrough field"). This module is both halves: the schema and
 * the validator it always needed.
 *
 * NAMING IS PORTED, NOT INVENTED. Field names follow schema.org's `Schedule`
 * (`byDay`/`repeatFrequency`/`startTime`/`endTime`/`exceptDates`) and `OpeningHoursSpecification`, and the
 * series-vs-instance split follows OpenActive's SessionSeries -> ScheduledSession. Both are real standards
 * for this exact domain; matching them costs nothing and keeps a future export interoperable.
 *
 * BACKWARD COMPATIBILITY IS LOAD-BEARING. 882 program entries already exist and carry none of the new
 * fields. Every new field is therefore OPTIONAL, and validation only fires on fields that are actually
 * present. A validator that rejected the legacy shape would break every write to every existing listing.
 */

export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/**
 * How exactly the schedule is known. `vague` is a real answer, not a gap: 58 live programs say
 * "Weekend schedule" and 33 say "Weekday schedule" because the provider does not publish times. Recording
 * that honestly is better than inventing a start time, which would be both authoritative-looking and
 * queryable -- the worst combination.
 */
export const SCHEDULE_PRECISION = ["exact", "day_only", "vague", "unknown"] as const;
export type SchedulePrecision = (typeof SCHEDULE_PRECISION)[number];

/**
 * The distinction that matters most in the entire schema. The core system's own listing-maintenance spec
 * reports 97.3% of the catalogue priced at zero, because the price field is required and defaults to `0`,
 * so "genuinely free" and "never found" are indistinguishable. `amount` is OMITTED when evidence is
 * `unknown`; it is never defaulted.
 */
export const PRICE_EVIDENCE = ["stated", "stated_free", "from", "unknown"] as const;
export type PriceEvidence = (typeof PRICE_EVIDENCE)[number];

/**
 * Unit discipline: "$625 for the 8-week term" is `{625, "per_term"}`, NEVER $78/class. Dividing a stated
 * price into a different unit invents a number the provider never published. The real stored values are
 * genuinely this varied -- "$55 per 30-minute lesson", "$1,115 community / $1,028 Y member per two-week
 * session", "Free with admission" -- which is why `sourceText` and `variants` exist alongside `amount`.
 */
export const PRICE_UNITS = [
  "per_person_per_session",
  "per_session",
  "per_class",
  "per_day",
  "per_week",
  "per_month",
  "per_term",
  "per_season",
  "per_year",
  "per_event",
  "total",
] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const REGISTRATION_STATUS = ["open", "closed", "waitlist", "not_required", "unknown"] as const;
export const PROGRAM_LEVELS = ["all", "beginner", "intermediate", "advanced"] as const;

/** ISO-8601 duration, restricted to the repeat intervals a children's programme actually uses. */
export const REPEAT_FREQUENCIES = ["P1D", "P1W", "P2W", "P1M", "P1Y"] as const;

/**
 * The five display buckets the catalogue already stores, with their real month spans. Numeric months are
 * the TRUTH and these are derived for display -- the owner's own example, "ages 8-12", cannot be expressed
 * as a bucket at all: it straddles `6–8` and `9–12`, and rounding outward sends a parent of an
 * eight-year-old to a class that starts at nine.
 *
 * NOTE the EN DASH. The stored values use "–" (U+2013), not a hyphen. Getting this wrong silently produces
 * a sixth bucket that matches nothing.
 */
export const AGE_BUCKETS: ReadonlyArray<{ label: string; minMonths: number; maxMonths: number }> = [
  { label: "0–2", minMonths: 0, maxMonths: 35 },
  { label: "3–5", minMonths: 36, maxMonths: 71 },
  { label: "6–8", minMonths: 72, maxMonths: 107 },
  { label: "9–12", minMonths: 108, maxMonths: 155 },
  { label: "Teens", minMonths: 156, maxMonths: 215 },
];

/** Every bucket the numeric range touches, in order. Overlap is the honest representation for display. */
export function monthsToAgeBuckets(minMonths: number, maxMonths: number): string[] {
  return AGE_BUCKETS.filter((b) => minMonths <= b.maxMonths && maxMonths >= b.minMonths).map((b) => b.label);
}

/** The widest span the buckets could mean. Lossy by nature -- only for reading legacy records forward. */
export function ageBucketsToMonths(buckets: readonly string[]): { minMonths: number; maxMonths: number } | null {
  const hit = AGE_BUCKETS.filter((b) => buckets.some((v) => String(v).trim() === b.label));
  if (hit.length === 0) return null;
  return {
    minMonths: Math.min(...hit.map((b) => b.minMonths)),
    maxMonths: Math.max(...hit.map((b) => b.maxMonths)),
  };
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isLocalTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}
export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

export interface ProgramValidationResult {
  ok: boolean;
  error?: string;
}

function fail(path: string, message: string): ProgramValidationResult {
  return { ok: false, error: `${path} ${message}` };
}

function validateSchedule(schedule: Record<string, unknown>, path: string): ProgramValidationResult {
  if ("repeatFrequency" in schedule && schedule.repeatFrequency !== null) {
    if (!(REPEAT_FREQUENCIES as readonly unknown[]).includes(schedule.repeatFrequency)) {
      return fail(`${path}.repeatFrequency`, `must be one of: ${REPEAT_FREQUENCIES.join(", ")}`);
    }
  }
  if ("byDay" in schedule && schedule.byDay !== null) {
    if (!Array.isArray(schedule.byDay)) return fail(`${path}.byDay`, "must be an array of day names");
    for (const day of schedule.byDay) {
      if (!(DAYS_OF_WEEK as readonly unknown[]).includes(day)) {
        return fail(`${path}.byDay`, `contains "${String(day)}" — must be one of: ${DAYS_OF_WEEK.join(", ")}`);
      }
    }
  }
  for (const key of ["startTime", "endTime"] as const) {
    if (key in schedule && schedule[key] !== null && !isLocalTime(schedule[key])) {
      return fail(`${path}.${key}`, `must be local 24-hour "HH:MM" (got ${JSON.stringify(schedule[key])})`);
    }
  }
  if (isLocalTime(schedule.startTime) && isLocalTime(schedule.endTime)) {
    // An overnight programme for children is not a thing this catalogue lists; an end before a start is a
    // parse error every time it has been seen.
    if (schedule.endTime <= schedule.startTime) {
      return fail(`${path}.endTime`, `(${schedule.endTime}) must be after startTime (${schedule.startTime})`);
    }
  }
  for (const key of ["validFrom", "validThrough"] as const) {
    if (key in schedule && schedule[key] !== null && !isIsoDate(schedule[key])) {
      return fail(`${path}.${key}`, `must be an ISO date "YYYY-MM-DD" (got ${JSON.stringify(schedule[key])})`);
    }
  }
  if (isIsoDate(schedule.validFrom) && isIsoDate(schedule.validThrough) && schedule.validThrough < schedule.validFrom) {
    return fail(`${path}.validThrough`, `(${schedule.validThrough}) is before validFrom (${schedule.validFrom})`);
  }
  if ("exceptDates" in schedule && schedule.exceptDates !== null) {
    if (!Array.isArray(schedule.exceptDates)) return fail(`${path}.exceptDates`, "must be an array of ISO dates");
    for (const date of schedule.exceptDates) {
      if (!isIsoDate(date)) return fail(`${path}.exceptDates`, `contains ${JSON.stringify(date)} — must be "YYYY-MM-DD"`);
    }
  }
  if ("precision" in schedule && schedule.precision !== null) {
    if (!(SCHEDULE_PRECISION as readonly unknown[]).includes(schedule.precision)) {
      return fail(`${path}.precision`, `must be one of: ${SCHEDULE_PRECISION.join(", ")}`);
    }
  }
  // A claim of exactness has to be backed by actual times, or it is a lie the query layer will trust.
  if (schedule.precision === "exact" && !(isLocalTime(schedule.startTime) && isLocalTime(schedule.endTime))) {
    return fail(`${path}.precision`, '"exact" requires both startTime and endTime — use "day_only" or "vague"');
  }
  if ("timezone" in schedule && schedule.timezone !== null && typeof schedule.timezone !== "string") {
    return fail(`${path}.timezone`, "must be an IANA timezone string, e.g. America/New_York");
  }
  return { ok: true };
}

function validatePrice(price: Record<string, unknown>, path: string): ProgramValidationResult {
  if (!(PRICE_EVIDENCE as readonly unknown[]).includes(price.evidence)) {
    return fail(`${path}.evidence`, `is required and must be one of: ${PRICE_EVIDENCE.join(", ")}`);
  }
  const hasAmount = price.amount !== undefined && price.amount !== null;
  if (hasAmount && (typeof price.amount !== "number" || !Number.isFinite(price.amount) || price.amount < 0)) {
    return fail(`${path}.amount`, "must be a non-negative number when present");
  }
  // THE 97.3%-priced-at-zero RULE, enforced rather than documented. "Unknown" must not carry a number, and
  // "free" must not be expressed as amount 0 -- that is exactly the collision that made the core
  // catalogue's price field meaningless.
  if (price.evidence === "unknown" && hasAmount) {
    return fail(`${path}.amount`, 'must be omitted when evidence is "unknown" — a default price is what made 97.3% of the catalogue read as free');
  }
  if (price.evidence === "stated_free" && hasAmount && price.amount !== 0) {
    return fail(`${path}.amount`, 'must be omitted or 0 when evidence is "stated_free"');
  }
  if ((price.evidence === "stated" || price.evidence === "from") && !hasAmount) {
    return fail(`${path}.amount`, `is required when evidence is "${price.evidence}" — use "unknown" if no price was found`);
  }
  if (hasAmount && !(PRICE_UNITS as readonly unknown[]).includes(price.unit)) {
    return fail(`${path}.unit`, `is required with an amount and must be one of: ${PRICE_UNITS.join(", ")}`);
  }
  if (hasAmount && typeof price.currency !== "string") {
    return fail(`${path}.currency`, 'is required with an amount, e.g. "USD"');
  }
  if ("variants" in price && price.variants !== null) {
    if (!Array.isArray(price.variants)) return fail(`${path}.variants`, "must be an array");
    for (const [i, v] of price.variants.entries()) {
      if (!v || typeof v !== "object") return fail(`${path}.variants[${i}]`, "must be an object");
      const variant = v as Record<string, unknown>;
      if (typeof variant.label !== "string" || !variant.label.trim()) {
        return fail(`${path}.variants[${i}].label`, "is required");
      }
      if (variant.amount !== undefined && variant.amount !== null && typeof variant.amount !== "number") {
        return fail(`${path}.variants[${i}].amount`, "must be a number when present");
      }
    }
  }
  return { ok: true };
}

function validateEvidence(evidence: unknown, path: string): ProgramValidationResult {
  if (evidence === null || evidence === undefined) return { ok: true };
  if (typeof evidence !== "object" || Array.isArray(evidence)) return fail(path, "must be an object");
  const e = evidence as Record<string, unknown>;
  if (e.sourceUrl !== undefined && e.sourceUrl !== null && typeof e.sourceUrl !== "string") {
    return fail(`${path}.sourceUrl`, "must be a string");
  }
  if (e.observedAt !== undefined && e.observedAt !== null && !isIsoDate(e.observedAt)) {
    return fail(`${path}.observedAt`, 'must be an ISO date "YYYY-MM-DD"');
  }
  return { ok: true };
}

/**
 * Validates a whole `recurringPrograms` array.
 *
 * Only fields that are PRESENT are checked, so the 882 legacy entries -- which carry none of the structured
 * fields -- continue to validate unchanged. What this catches is a malformed NEW field: a time that isn't a
 * time, an end before a start, an age range inverted, a price claiming to be known with no amount.
 */
export function validateRecurringPrograms(value: unknown): ProgramValidationResult {
  if (value === null) return { ok: true };
  if (!Array.isArray(value)) return { ok: false, error: "recurringPrograms must be an array" };
  if (value.length > 200) {
    return { ok: false, error: `recurringPrograms has ${value.length} entries — that is a scrape artefact, not a programme list` };
  }

  for (const [i, entry] of value.entries()) {
    const path = `recurringPrograms[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail(path, "must be an object");
    const p = entry as Record<string, unknown>;

    // (2026-08-09, owner report from a live card) `cadence: "Custom"` renders on the public card as a
    // chip reading CUSTOM, sitting in the row beside AGES 6-8 / AGES 9-12. It is the pipeline recording
    // that it could not classify the schedule -- the same non-answer class as `no category` and
    // `Multi-category`, both already banned -- and 317 of 830 live programmes carried it. A parent reading
    // "CUSTOM" learns nothing and is shown a machine's shrug. Absence is the correct representation.
    if ("cadence" in p && p.cadence !== null && p.cadence !== undefined) {
      const cadence = String(p.cadence).trim().toLowerCase();
      if (cadence === "custom" || cadence === "varies" || cadence === "other") {
        return fail(
          `${path}.cadence`,
          `is "${String(p.cadence)}", which is the pipeline recording that it could not classify the schedule, not a fact about the programme — it renders to a parent as a chip. Omit the field instead; an absent cadence is an honest absence.`,
        );
      }
    }

    if ("daysOfWeek" in p && p.daysOfWeek !== null) {
      if (!Array.isArray(p.daysOfWeek)) return fail(`${path}.daysOfWeek`, "must be an array of day names");
      for (const day of p.daysOfWeek) {
        if (!(DAYS_OF_WEEK as readonly unknown[]).includes(day)) {
          return fail(`${path}.daysOfWeek`, `contains "${String(day)}" — must be one of: ${DAYS_OF_WEEK.join(", ")}`);
        }
      }
    }

    for (const key of ["startDate", "endDate"] as const) {
      if (key in p && p[key] !== null && !isIsoDate(p[key])) {
        return fail(`${path}.${key}`, `must be an ISO date "YYYY-MM-DD" (got ${JSON.stringify(p[key])})`);
      }
    }

    if ("schedule" in p && p.schedule !== null) {
      if (typeof p.schedule !== "object" || Array.isArray(p.schedule)) return fail(`${path}.schedule`, "must be an object");
      const r = validateSchedule(p.schedule as Record<string, unknown>, `${path}.schedule`);
      if (!r.ok) return r;
    }

    for (const key of ["ageMinMonths", "ageMaxMonths"] as const) {
      if (key in p && p[key] !== null) {
        const v = p[key];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 300) {
          return fail(`${path}.${key}`, "must be a whole number of months between 0 and 300");
        }
      }
    }
    if (typeof p.ageMinMonths === "number" && typeof p.ageMaxMonths === "number" && p.ageMaxMonths < p.ageMinMonths) {
      return fail(`${path}.ageMaxMonths`, `(${p.ageMaxMonths}) is below ageMinMonths (${p.ageMinMonths})`);
    }

    if ("price" in p && p.price !== null) {
      if (typeof p.price !== "object" || Array.isArray(p.price)) return fail(`${path}.price`, "must be an object");
      const r = validatePrice(p.price as Record<string, unknown>, `${path}.price`);
      if (!r.ok) return r;
    }

    if ("capacity" in p && p.capacity !== null) {
      if (typeof p.capacity !== "object" || Array.isArray(p.capacity)) return fail(`${path}.capacity`, "must be an object");
      const cap = (p.capacity as Record<string, unknown>).max;
      if (cap !== undefined && cap !== null && (typeof cap !== "number" || !Number.isInteger(cap) || cap < 1)) {
        return fail(`${path}.capacity.max`, "must be a positive whole number when present");
      }
    }

    if ("registration" in p && p.registration !== null) {
      if (typeof p.registration !== "object" || Array.isArray(p.registration)) {
        return fail(`${path}.registration`, "must be an object");
      }
      const reg = p.registration as Record<string, unknown>;
      if (reg.required !== undefined && reg.required !== null && typeof reg.required !== "boolean") {
        return fail(`${path}.registration.required`, "must be a boolean");
      }
      if (reg.status !== undefined && reg.status !== null && !(REGISTRATION_STATUS as readonly unknown[]).includes(reg.status)) {
        return fail(`${path}.registration.status`, `must be one of: ${REGISTRATION_STATUS.join(", ")}`);
      }
      for (const key of ["opensAt", "closesAt"] as const) {
        if (reg[key] !== undefined && reg[key] !== null && !isIsoDate(reg[key])) {
          return fail(`${path}.registration.${key}`, 'must be an ISO date "YYYY-MM-DD"');
        }
      }
    }

    if ("level" in p && p.level !== null && !(PROGRAM_LEVELS as readonly unknown[]).includes(p.level)) {
      return fail(`${path}.level`, `must be one of: ${PROGRAM_LEVELS.join(", ")}`);
    }

    for (const key of ["evidence", "priceEvidence"] as const) {
      if (key in p) {
        const r = validateEvidence(p[key], `${path}.${key}`);
        if (!r.ok) return r;
      }
    }
  }
  return { ok: true };
}

/**
 * Best-effort parse of a legacy `timeText` into a structured window. Deliberately conservative: it returns
 * a result ONLY for an unambiguous single start-and-end range, because a partial parse written into
 * `schedule` would look authoritative and be queryable -- worse than the prose it replaced.
 *
 * Handles "4:30-6:00 PM", "9 AM – 7 PM", "5pm to 8pm". Returns null for multi-window strings
 * ("Mon/Thu 4:30-6:00 PM; Tue 3:30-5:00 PM"), which need one program entry per window, not a guess.
 */
export function parseTimeRange(timeText: string): { startTime: string; endTime: string } | null {
  const text = String(timeText).replace(/–|—/g, "-").toLowerCase();
  if (/;|\band\b/.test(text)) return null; // more than one window — never collapse these
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/g;
  const matches = [...text.matchAll(re)];
  if (matches.length !== 1) return null;
  const [, h1, m1, mer1, h2, m2, mer2] = matches[0];

  const to24 = (hour: string, minute: string | undefined, meridiem: string | undefined): number | null => {
    let h = Number(hour);
    if (h < 1 || h > 12) return null;
    const mer = (meridiem ?? "").replace(/\./g, "");
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return h * 60 + Number(minute ?? "0");
  };
  // "4:30-6:00 PM" -- the first half inherits the second's meridiem, which is how people write it.
  const end = to24(h2, m2, mer2);
  const start = to24(h1, m1, mer1 ?? mer2);
  if (start === null || end === null || end <= start) return null;
  const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { startTime: fmt(start), endTime: fmt(end) };
}
