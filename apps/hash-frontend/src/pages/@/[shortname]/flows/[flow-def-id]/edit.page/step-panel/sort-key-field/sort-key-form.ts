import {
  hasOnlyKeys,
  isRecord,
  readTarget,
  toSubject,
} from "../shared/condition-targets";

import type { ConditionTarget } from "../shared/condition-targets";
import type { SortKey } from "@local/hash-isomorphic-utils/flows/sort-key";

/** A sort key as the field shows it: what it sorts by, and which way. */
export type SortForm = { targetKey: string; direction: SortKey["direction"] };

/** Reads a saved sort key back, or `null` if the field can't show it, such as one on a field of the items. */
export const readSortForm = (
  sortKey: unknown,
  targets: ReadonlyMap<string, ConditionTarget>,
): SortForm | null => {
  if (
    !isRecord(sortKey) ||
    !hasOnlyKeys(sortKey, ["subject", "direction"]) ||
    (sortKey.direction !== "ascending" && sortKey.direction !== "descending")
  ) {
    return null;
  }

  const target = readTarget(sortKey.subject, targets);

  return target
    ? { targetKey: target.key, direction: sortKey.direction }
    : null;
};

export const toSortKey = (
  target: ConditionTarget,
  direction: SortKey["direction"],
): SortKey => ({ subject: toSubject(target), direction });
