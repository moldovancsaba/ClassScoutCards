import { describe, expect, it } from "vitest";
import { prioritise, STATE_PRIORITY, type Card } from "./defect-cohorts";

// The cohort queue's whole point is that a PUBLISHED card carrying a known defect is doing harm to a
// family right now, while a QUARANTINED one is not. These pin that ordering, and the two ways it could
// silently go wrong: a card matching several cohorts appearing twice, and an unrecognised state jumping
// the queue ahead of real live harm.
describe("defect-cohort queue prioritisation", () => {
  const card = (id: string, state: string): Card => ({ contentCardId: id, state, title: id });

  it("puts PUBLISHED first and BLOCKED_TERMINAL last", () => {
    const out = prioritise([card("a", "BLOCKED_TERMINAL"), card("b", "QUARANTINED"), card("c", "PUBLISHED")]);
    expect(out.map((c) => c.contentCardId)).toEqual(["c", "b", "a"]);
  });

  it("dedupes a card that matches several cohorts", () => {
    const out = prioritise([card("dup", "PUBLISHED"), card("dup", "PUBLISHED"), card("other", "QUARANTINED")]);
    expect(out).toHaveLength(2);
  });

  it("sorts an unknown state LAST — an unrecognised state is not evidence of urgency", () => {
    const out = prioritise([card("weird", "SOME_NEW_STATE"), card("live", "PUBLISHED"), card("held", "QUARANTINED")]);
    expect(out.map((c) => c.contentCardId)).toEqual(["live", "held", "weird"]);
  });

  it("orders the full known state list exactly as STATE_PRIORITY declares", () => {
    const shuffled = [...STATE_PRIORITY].reverse().map((s, i) => card(`c${i}`, s));
    expect(prioritise(shuffled).map((c) => c.state)).toEqual(STATE_PRIORITY);
  });
});
