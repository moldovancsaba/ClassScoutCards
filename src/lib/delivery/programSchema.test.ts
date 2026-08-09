import { describe, expect, it } from "vitest";
import {
  ageBucketsToMonths,
  monthsToAgeBuckets,
  parseTimeRange,
  validateRecurringPrograms,
} from "./programSchema";
import { validateWriteRequest } from "./cardBridgeWrite";

const ok = (programs: unknown) => validateRecurringPrograms(programs).ok;
const err = (programs: unknown) => validateRecurringPrograms(programs).error ?? "";

describe("the legacy shape must keep validating", () => {
  it("accepts a real stored program carrying none of the new fields", () => {
    // Verbatim from prov-flatbush-ymca. 882 entries look like this; rejecting them would break every
    // write to every existing listing.
    expect(
      ok([
        {
          id: "flatbush-ymca-1",
          title: "Flatbush Ymca",
          cadence: "Weekends",
          daysOfWeek: ["Saturday"],
          timeText: "Weekend schedule",
          ageRanges: ["3–5", "6–8", "9–12", "Teens"],
          activityTypes: ["Sports"],
          summary: null,
          priceText: null,
          registrationUrl: null,
        },
      ]),
    ).toBe(true);
  });

  it("accepts an empty array and null", () => {
    expect(ok([])).toBe(true);
    expect(ok(null)).toBe(true);
  });

  it("rejects a non-array and a non-object entry", () => {
    expect(ok("Tuesdays at 4pm")).toBe(false);
    expect(ok(["Tuesdays at 4pm"])).toBe(false);
  });

  it("rejects a scrape-artefact-length list", () => {
    expect(err(Array.from({ length: 201 }, () => ({ title: "x" })))).toMatch(/scrape artefact/);
  });
});

describe("schedule", () => {
  const withSchedule = (schedule: unknown) => [{ title: "Friday Open Soccer", schedule }];

  it("accepts the owner's worked example", () => {
    expect(
      ok(
        withSchedule({
          repeatFrequency: "P1W",
          byDay: ["Friday"],
          startTime: "17:00",
          endTime: "20:00",
          timezone: "America/New_York",
          validFrom: "2026-09-05",
          validThrough: "2026-12-19",
          exceptDates: ["2026-11-27"],
          precision: "exact",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a time that is not a 24-hour HH:MM", () => {
    expect(err(withSchedule({ startTime: "5pm" }))).toMatch(/startTime/);
    expect(err(withSchedule({ startTime: "25:00" }))).toMatch(/startTime/);
    expect(err(withSchedule({ endTime: "17:60" }))).toMatch(/endTime/);
  });

  it("rejects an end before a start — every instance seen has been a parse error", () => {
    expect(err(withSchedule({ startTime: "17:00", endTime: "09:00" }))).toMatch(/must be after startTime/);
  });

  it("rejects a day name that is not a day", () => {
    expect(err(withSchedule({ byDay: ["Weekends"] }))).toMatch(/byDay/);
    expect(err(withSchedule({ byDay: ["friday"] }))).toMatch(/byDay/);
  });

  it("rejects a validThrough before its validFrom", () => {
    expect(err(withSchedule({ validFrom: "2026-12-19", validThrough: "2026-09-05" }))).toMatch(/is before validFrom/);
  });

  it('will not let "exact" be claimed without both times — the query layer would trust it', () => {
    expect(err(withSchedule({ precision: "exact", byDay: ["Friday"] }))).toMatch(/requires both startTime and endTime/);
    expect(ok(withSchedule({ precision: "vague", byDay: ["Saturday", "Sunday"] }))).toBe(true);
  });

  it("accepts vague as a real answer, since 58 live programs only say 'Weekend schedule'", () => {
    expect(ok(withSchedule({ byDay: ["Saturday", "Sunday"], precision: "vague" }))).toBe(true);
  });
});

describe("price — the 97.3%-priced-at-zero rule, enforced", () => {
  const withPrice = (price: unknown) => [{ title: "Friday Open Soccer", price }];

  it("accepts the owner's worked example", () => {
    expect(
      ok(
        withPrice({
          evidence: "stated",
          amount: 12,
          currency: "USD",
          unit: "per_person_per_session",
          sourceText: "$12 / person",
        }),
      ),
    ).toBe(true);
  });

  it("refuses an amount when the evidence is unknown", () => {
    expect(err(withPrice({ evidence: "unknown", amount: 0, currency: "USD", unit: "per_session" }))).toMatch(
      /must be omitted when evidence is "unknown"/,
    );
  });

  it("refuses a stated price with no amount — use unknown instead", () => {
    expect(err(withPrice({ evidence: "stated", currency: "USD", unit: "per_session" }))).toMatch(
      /use "unknown" if no price was found/,
    );
  });

  it("distinguishes genuinely free from not-found, which the core field cannot", () => {
    expect(ok(withPrice({ evidence: "stated_free", sourceText: "Free" }))).toBe(true);
    expect(ok(withPrice({ evidence: "unknown" }))).toBe(true);
    expect(err(withPrice({ evidence: "stated_free", amount: 25, currency: "USD", unit: "per_session" }))).toMatch(
      /stated_free/,
    );
  });

  it("requires a unit alongside an amount, so a term price cannot be read as a class price", () => {
    expect(err(withPrice({ evidence: "stated", amount: 625, currency: "USD" }))).toMatch(/unit/);
    expect(ok(withPrice({ evidence: "stated", amount: 625, currency: "USD", unit: "per_term" }))).toBe(true);
  });

  it("carries member/non-member variants, which real stored values require", () => {
    expect(
      ok(
        withPrice({
          evidence: "stated",
          amount: 1115,
          currency: "USD",
          unit: "per_session",
          sourceText: "$1,115 community / $1,028 Y member per two-week session",
          variants: [{ label: "Y member", amount: 1028 }],
        }),
      ),
    ).toBe(true);
    expect(err(withPrice({ evidence: "unknown", variants: [{ amount: 10 }] }))).toMatch(/label/);
  });

  it("rejects an unrecognised evidence value rather than letting it through", () => {
    expect(err(withPrice({ evidence: "guessed", amount: 12, currency: "USD", unit: "per_session" }))).toMatch(
      /evidence/,
    );
  });
});

describe("ages in months", () => {
  it("expresses the owner's example, which the buckets cannot", () => {
    // "Ages 8-12" straddles 6–8 and 9–12.
    expect(monthsToAgeBuckets(96, 155)).toEqual(["6–8", "9–12"]);
    expect(ok([{ title: "Friday Open Soccer", ageMinMonths: 96, ageMaxMonths: 155 }])).toBe(true);
  });

  it("rejects an inverted range", () => {
    expect(err([{ title: "x", ageMinMonths: 155, ageMaxMonths: 96 }])).toMatch(/below ageMinMonths/);
  });

  it("rejects a non-integer or out-of-range value", () => {
    expect(ok([{ title: "x", ageMinMonths: 8 }])).toBe(true); // 8 months is a real infant class
    expect(err([{ title: "x", ageMinMonths: -1 }])).toMatch(/ageMinMonths/);
    expect(err([{ title: "x", ageMaxMonths: 4000 }])).toMatch(/ageMaxMonths/);
    expect(err([{ title: "x", ageMinMonths: 12.5 }])).toMatch(/ageMinMonths/);
  });

  it("round-trips the legacy buckets to their widest honest span", () => {
    expect(ageBucketsToMonths(["3–5"])).toEqual({ minMonths: 36, maxMonths: 71 });
    expect(ageBucketsToMonths(["6–8", "9–12"])).toEqual({ minMonths: 72, maxMonths: 155 });
    expect(ageBucketsToMonths(["Teens"])).toEqual({ minMonths: 156, maxMonths: 215 });
  });

  it("uses the EN DASH the stored data actually uses", () => {
    // A hyphen here silently matches nothing and invents a sixth bucket.
    expect(ageBucketsToMonths(["3-5"])).toBeNull();
    expect(monthsToAgeBuckets(36, 71)[0]).toBe("3–5");
  });
});

describe("capacity, registration and level", () => {
  it("accepts the owner's worked example", () => {
    expect(
      ok([
        {
          title: "Friday Open Soccer",
          capacity: { max: 25, unit: "children" },
          registration: { required: false, status: "not_required" },
          level: "all",
        },
      ]),
    ).toBe(true);
  });

  it("rejects a nonsense capacity and an unknown registration status", () => {
    expect(err([{ title: "x", capacity: { max: 0 } }])).toMatch(/capacity.max/);
    expect(err([{ title: "x", registration: { status: "maybe" } }])).toMatch(/registration.status/);
    expect(err([{ title: "x", level: "expert" }])).toMatch(/level/);
  });

  it("validates registration windows as real dates", () => {
    expect(ok([{ title: "x", registration: { opensAt: "2026-03-01", closesAt: "2026-05-31" } }])).toBe(true);
    expect(err([{ title: "x", registration: { opensAt: "March" } }])).toMatch(/opensAt/);
  });
});

describe("parseTimeRange — deliberately conservative", () => {
  it("parses the common single-window forms", () => {
    expect(parseTimeRange("4:30-6:00 PM")).toEqual({ startTime: "16:30", endTime: "18:00" });
    expect(parseTimeRange("9 AM – 7 PM")).toEqual({ startTime: "09:00", endTime: "19:00" });
    expect(parseTimeRange("5pm to 8pm")).toEqual({ startTime: "17:00", endTime: "20:00" });
    expect(parseTimeRange("10:00 AM - 12:30 PM")).toEqual({ startTime: "10:00", endTime: "12:30" });
  });

  it("lets the first half inherit the second's meridiem, which is how people write it", () => {
    expect(parseTimeRange("4:30-6:00 PM")?.startTime).toBe("16:30");
  });

  it("REFUSES a multi-window string rather than collapsing it to one", () => {
    // A real stored value. It needs one program entry per window; guessing which one is fabrication.
    expect(parseTimeRange("Mon/Thu 4:30-6:00 PM; Tue 3:30-5:00 PM; Sat 9:00-10:30 AM")).toBeNull();
  });

  it("returns null for prose with no range, rather than half an answer", () => {
    expect(parseTimeRange("Weekend schedule")).toBeNull();
    expect(parseTimeRange("See official schedule")).toBeNull();
    expect(parseTimeRange("Starts at 4pm")).toBeNull();
  });

  it("returns null when the range is backwards or impossible", () => {
    expect(parseTimeRange("6:00 PM - 4:30 PM")).toBeNull();
    expect(parseTimeRange("13 AM - 15 PM")).toBeNull();
  });
});

describe("the bridge write path rejects a malformed program", () => {
  const body = (recurringPrograms: unknown) => ({
    collection: "providers",
    id: "prov-123",
    updates: { recurringPrograms },
    reason: "Adding a structured schedule from the provider's own page",
    source: "test",
  });

  it("no longer accepts recurringPrograms as a bare passthrough", () => {
    const result = validateWriteRequest(body([{ title: "x", schedule: { startTime: "5pm" } }]));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/startTime/);
  });

  it("still accepts a well-formed structured program", () => {
    expect(
      validateWriteRequest(
        body([
          {
            title: "Friday Open Soccer",
            schedule: { repeatFrequency: "P1W", byDay: ["Friday"], startTime: "17:00", endTime: "20:00", precision: "exact" },
            ageMinMonths: 96,
            ageMaxMonths: 155,
            price: { evidence: "stated", amount: 12, currency: "USD", unit: "per_person_per_session" },
            capacity: { max: 25 },
          },
        ]),
      ).ok,
    ).toBe(true);
  });

  it("still accepts the legacy shape through the write path", () => {
    expect(validateWriteRequest(body([{ title: "Flatbush Ymca", cadence: "Weekends", timeText: "Weekend schedule" }])).ok).toBe(true);
  });
});

describe("cadence non-answers (owner report from a live card, 2026-08-09)", () => {
  it('rejects cadence "Custom", which rendered on the public card as a CUSTOM chip', () => {
    const r = validateRecurringPrograms([{ title: "Age-group teams, clinics and camps", cadence: "Custom" }]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/could not classify/);
  });

  it("rejects its siblings, and is case-insensitive", () => {
    for (const c of ["custom", "CUSTOM", "Varies", "other"]) {
      expect(validateRecurringPrograms([{ cadence: c }]).ok).toBe(false);
    }
  });

  it("accepts a real cadence, and accepts the field being absent", () => {
    expect(validateRecurringPrograms([{ cadence: "Weekly" }]).ok).toBe(true);
    expect(validateRecurringPrograms([{ cadence: "Weekends" }]).ok).toBe(true);
    expect(validateRecurringPrograms([{ title: "Saturday clinic" }]).ok).toBe(true);
    expect(validateRecurringPrograms([{ cadence: null }]).ok).toBe(true);
  });
});
