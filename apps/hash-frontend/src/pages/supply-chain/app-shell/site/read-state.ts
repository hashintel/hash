import type { OpportunityStatuses } from "./opportunities";

export type ReadOp = "add" | "remove";

/**
 * Coalesce a sequence of read/unread operations so the last intent per scope
 * key wins. Mirrors how the hook accumulates pending ops in a `Map` before
 * flushing them, so rapid mark-read/mark-unread toggles resolve to one write.
 */
export const coalesceReadOps = (
  ops: Iterable<readonly [string, ReadOp]>,
): Map<string, ReadOp> => {
  const coalesced = new Map<string, ReadOp>();
  for (const [key, op] of ops) {
    coalesced.set(key, op);
  }
  return coalesced;
};

/** Merge read/unread operations onto a base set of read scope keys. */
export const applyReadOps = (
  base: string[],
  ops: Map<string, ReadOp>,
): string[] => {
  const keys = new Set(base);
  for (const [key, op] of ops) {
    if (op === "add") {
      keys.add(key);
    } else {
      keys.delete(key);
    }
  }
  return [...keys];
};

/** Merge read keys from duplicate preference entities without reordering. */
export const mergeReadKeySets = (
  keySets: Iterable<readonly string[]>,
): string[] => {
  const keys = new Set<string>();
  for (const keySet of keySets) {
    for (const key of keySet) {
      keys.add(key);
    }
  }
  return [...keys];
};

export const buildStatuses = (readKeys: string[]): OpportunityStatuses =>
  Object.fromEntries(readKeys.map((key) => [key, { read: true }]));
