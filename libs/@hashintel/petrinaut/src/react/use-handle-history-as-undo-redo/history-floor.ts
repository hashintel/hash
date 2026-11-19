import type { HistoryEntry, PetrinautHistory } from "@hashintel/petrinaut-core";

/**
 * Names one entry of a history so that it can be found again. A handle drops
 * its oldest entries and shifts the rest down, so an index does not last: an
 * entry is known by its timestamp. Changes made within one millisecond share
 * theirs, so the mark also counts the entries with that timestamp before it.
 */
export type HistoryMark = { timestamp: string; ordinal: number };

const madeAt = (timestamp: string) => (entry: HistoryEntry) =>
  entry.timestamp === timestamp;

/** A mark on the entry the history is at, or `null` when it is at none. */
export const markCurrentEntry = (
  history: PetrinautHistory,
): HistoryMark | null => {
  const entries = history.entries.get();
  const index = history.currentIndex.get();
  const entry = entries[index];
  return entry
    ? {
        timestamp: entry.timestamp,
        ordinal: index - entries.findIndex(madeAt(entry.timestamp)),
      }
    : null;
};

/**
 * The index of the marked entry: the oldest one a history that starts at the
 * mark goes back to. 0 with no mark, and once the marked entry is dropped,
 * since every entry left came after it. Where entries that share the
 * timestamp were dropped before it, the index is the last it can be, so the
 * floor is never before the mark.
 */
export const historyFloor = (
  entries: readonly HistoryEntry[],
  mark: HistoryMark | null,
): number => {
  if (mark === null) {
    return 0;
  }
  const first = entries.findIndex(madeAt(mark.timestamp));
  const last = entries.findLastIndex(madeAt(mark.timestamp));
  return first === -1 ? 0 : Math.min(first + mark.ordinal, last);
};
