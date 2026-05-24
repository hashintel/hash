/**
 * Clamps an index against a list length. Returns `null` for a missing index
 * or an empty list; otherwise returns the smaller of `index` and the last
 * valid position.
 */
export const clampIndex = (index: number | null, itemCount: number): number | null => {
  if (index === null || itemCount === 0) {
    return null;
  }
  return Math.min(index, itemCount - 1);
};
