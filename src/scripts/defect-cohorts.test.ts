import { describe, expect, it } from "vitest";
import {
  prioritise, partitionByScope, isMaintainable,
  MAINTAINABLE_STATES, STATE_PRIORITY, type Card,
} from "./defect-cohorts";

const card = (id: string, state: string): Card => ({ contentCardId: id, state, title: id });

// SCOPE (owner directive, 2026-08-08): every card is maintained, published AND draft. The only exempt
// cards are those whose CONTENT is forbidden. These tests exist because the rule was got wrong once —
// an earlier version treated "not published" as "not worth a batch", which confused priority with
// scope and would have left 1,847 of 2,626 maintainable cards untouched.
describe("maintenance scope: drafts are in, content-forbidden is out", () => {
  it("treats every draft state as maintainable, not just PUBLISHED", () => {
    for (const s of ["DISCOVERED", "PREPARING", "BLOCKED_REPAIRABLE", "PARKED_COOLDOWN", "REVIEW_READY", "EXTRACTED", "EXTRACTING"]) {
      expect(isMaintainable(s), `${s} must be maintained`).toBe(true);
    }
    expect(isMaintainable("PUBLISHED")).toBe(true);
  });

  it("exempts ONLY the content-forbidden and no-entity states", () => {
    expect(isMaintainable("QUARANTINED")).toBe(false);
    expect(isMaintainable("BLOCKED_TERMINAL")).toBe(false);
  });

  it("keeps drafts in the queue rather than filtering them out", () => {
    const { maintain, contentForbidden, noEntity } = partitionByScope([
      card("live", "PUBLISHED"), card("draft1", "DISCOVERED"), card("draft2", "BLOCKED_REPAIRABLE"),
      card("draft3", "PARKED_COOLDOWN"), card("forbidden", "QUARANTINED"), card("empty", "BLOCKED_TERMINAL"),
    ]);
    expect(maintain.map((c) => c.contentCardId)).toEqual(["live", "draft1", "draft2", "draft3"]);
    expect(contentForbidden.map((c) => c.contentCardId)).toEqual(["forbidden"]);
    expect(noEntity.map((c) => c.contentCardId)).toEqual(["empty"]);
  });

  it("separates the two exempt reasons — quarantine and terminal are NOT interchangeable", () => {
    // A quarantined card must never be revived; a terminal duplicate simply has no entity behind it.
    // Collapsing them would either bury a repairable business or resurrect a prohibited one.
    const { contentForbidden, noEntity } = partitionByScope([card("q", "QUARANTINED"), card("t", "BLOCKED_TERMINAL")]);
    expect(contentForbidden).toHaveLength(1);
    expect(noEntity).toHaveLength(1);
  });

  it("a draft that matches several cohorts appears once, still in the queue", () => {
    const { maintain } = partitionByScope([card("d", "DISCOVERED"), card("d", "DISCOVERED")]);
    expect(maintain).toHaveLength(1);
  });
});

describe("prioritisation orders the queue without shrinking it", () => {
  it("puts PUBLISHED first but keeps every draft present", () => {
    const out = prioritise([card("a", "PARKED_COOLDOWN"), card("b", "DISCOVERED"), card("c", "PUBLISHED")]);
    expect(out[0].contentCardId).toBe("c");
    expect(out).toHaveLength(3);
  });

  it("sorts an unknown state LAST — an unrecognised state is not evidence of urgency", () => {
    const out = prioritise([card("weird", "SOME_NEW_STATE"), card("live", "PUBLISHED"), card("held", "DISCOVERED")]);
    expect(out.map((c) => c.contentCardId)).toEqual(["live", "held", "weird"]);
  });

  it("orders the full known state list exactly as STATE_PRIORITY declares", () => {
    const shuffled = [...STATE_PRIORITY].reverse().map((s, i) => card(`c${i}`, s));
    expect(prioritise(shuffled).map((c) => c.state)).toEqual([...STATE_PRIORITY]);
  });

  it("every maintainable state ranks ahead of every exempt one", () => {
    const worstMaintainable = Math.max(...MAINTAINABLE_STATES.map((s) => STATE_PRIORITY.indexOf(s)));
    expect(worstMaintainable).toBeLessThan(STATE_PRIORITY.indexOf("QUARANTINED"));
  });
});
