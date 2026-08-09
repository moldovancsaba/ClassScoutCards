import { isNonAnswerCategoryValue, NO_CATEGORY_PLACEHOLDER } from "@/lib/delivery/activityAlignment";

/**
 * The two value-shape guards that BOTH write paths need, extracted here 2026-08-09 for a reason worth
 * stating: they were only on one of them.
 *
 * `validateWriteRequest` rejects a compound place ("Manhattan/Brooklyn"), a delivery model ("NYC-wide")
 * and the `no category` / `Multi-category` non-answers. `validateSplitRequest` did not — and a split
 * INSERTS documents, so it is the one path that can create a record from nothing. A split child could
 * therefore be born carrying exactly the values every other path rejects, and then be un-editable back
 * to a good state only by the update path that would have refused to create it in the first place.
 *
 * They live in their own module rather than in `cardBridgeWrite.ts` because `cardBridgeWrite` already
 * imports `computeContentCardIdentity` from `cardBridgeSplit`; making split import from write would
 * close the cycle. This module imports from neither.
 *
 * Each returns `null` when the value is acceptable, or a caller-facing message when it is not, so a
 * caller can prefix its own field label ("children[0].borough") without the guard knowing about it.
 */

/**
 * A place field must name ONE place.
 *
 * Separators are listed rather than inferred, and the list has grown three times as new shapes turned
 * up in real data — `/`, `and`, `&`, `+`, then `or`, `;`, `|`, then `,`. No canonical name in the NYC,
 * LA or expansion-market vocabularies contains any of them, which is asserted by a test over all of them.
 *
 * An EMPTY value is deliberately allowed: clearing a place field is how a reviewer records an honest
 * absence when no single answer exists, and an empty field is better than a wrong one.
 */
export function placeValueError(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const v = value.trim();
  const COMPOUND = /\s*(?:\/|\band\b|\bor\b|&|\+|;|\||,)\s*/i;
  const NOT_A_PLACE = /^(?:multiple\b|various\b|citywide$|nyc-?wide$|city-?wide$|mobile$|virtual$|online$|tbd$|n\/?a$)/i;
  const DELIVERY_TOKEN = /\b(?:mobile|virtual|online|citywide|nyc-?wide|multiple locations?)\b/i;
  if (!COMPOUND.test(v) && !NOT_A_PLACE.test(v) && !DELIVERY_TOKEN.test(v)) return null;
  return (
    `must name ONE place, not a compound or a delivery model (got "${v}"). A compound like ` +
    `"Manhattan/Brooklyn" usually hides a split candidate — card each real location separately. A ` +
    `delivery model like "NYC-wide" or "mobile" answers how the programme is delivered, not where a ` +
    `child goes; if the operator has no fixed venue it is out of scope entirely. If no single place is ` +
    `evidenced, write an empty string — an honest absence is better than a wrong or vague answer.`
  );
}

/**
 * A category field must not hold the pipeline's own record of having failed to classify the listing:
 * the `no category` ingestion placeholder, or a `Multi-category`/`Multi-enrichment`/`Multi-Activity`
 * non-answer. Both have been found rendered as a real chip on a real family's card.
 */
export function categoryValueError(value: unknown): string | null {
  const values = Array.isArray(value) ? value : [value];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const v = raw.trim().toLowerCase();
    if (v === NO_CATEGORY_PLACEHOLDER.toLowerCase()) {
      return (
        `must never contain the ingestion placeholder "${NO_CATEGORY_PLACEHOLDER}" (owner directive: ` +
        `never add "no category" even when there is no category). Omit the field instead — an absent ` +
        `value is correct; a placeholder string renders as a literal "NO CATEGORY" chip on a real ` +
        `family's card.`
      );
    }
    if (isNonAnswerCategoryValue(raw)) {
      return (
        `must not contain "${raw.trim()}" — it records the pipeline's failure to classify rather than ` +
        `naming anything a family can act on, and it renders on the card as a chip. Omit the field, or ` +
        `write the real activity.`
      );
    }
  }
  return null;
}
