import { useState } from "react";

/** Jumps the history remembers on each side of the current position. */
const MAX_REMEMBERED_JUMPS = 100;

export type JumpHistory = {
  canGoBack: boolean;
  canGoForward: boolean;
  /** Remember a jump about to happen; a new jump discards the forward leg. */
  record: (fromCellId: string | null, toCellId: string) => void;
  /** The cell to return to, already popped — or null when at the start. */
  back: (currentCellId: string | null) => string | null;
  /** The cell to revisit, already popped — or null when at the end. */
  forward: (currentCellId: string | null) => string | null;
};

/**
 * An IDE-style jump list for the notebook: reference jumps (an arc to its
 * place, an explorer row to its cell) push where the user came from, and
 * back/forward walk that trail. Plain arrow-key moves and clicks are not
 * jumps — only navigations that teleport across the list are remembered.
 */
export function useJumpHistory(): JumpHistory {
  const [stacks, setStacks] = useState<{ past: string[]; future: string[] }>({
    past: [],
    future: [],
  });

  return {
    canGoBack: stacks.past.length > 0,
    canGoForward: stacks.future.length > 0,
    record: (fromCellId, toCellId) => {
      setStacks(({ past }) => ({
        past:
          fromCellId === null || fromCellId === toCellId
            ? past
            : [...past.slice(-(MAX_REMEMBERED_JUMPS - 1)), fromCellId],
        // A fresh jump forks the trail: the forward leg no longer applies.
        future: [],
      }));
    },
    back: (currentCellId) => {
      const target = stacks.past.at(-1) ?? null;
      if (target === null) {
        return null;
      }
      setStacks(({ past, future }) => ({
        past: past.slice(0, -1),
        future:
          currentCellId === null
            ? future
            : [currentCellId, ...future.slice(0, MAX_REMEMBERED_JUMPS - 1)],
      }));
      return target;
    },
    forward: (currentCellId) => {
      const target = stacks.future[0] ?? null;
      if (target === null) {
        return null;
      }
      setStacks(({ past, future }) => ({
        past:
          currentCellId === null
            ? past
            : [...past.slice(-(MAX_REMEMBERED_JUMPS - 1)), currentCellId],
        future: future.slice(1),
      }));
      return target;
    },
  };
}
