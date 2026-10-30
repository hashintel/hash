/**
 * Where the arrow keys move the active hit among `count` hits, clamped to
 * the list; `null` for any other key, which is not a move.
 */
export const nextActive = (
  active: number,
  key: string,
  count: number,
): number | null => {
  switch (key) {
    case "ArrowDown":
      return Math.min(active + 1, Math.max(0, count - 1));
    case "ArrowUp":
      return Math.max(0, active - 1);
    default:
      return null;
  }
};
