import { arrayMove } from "@dnd-kit/sortable";

/**
 * The order after dropping the row at `from` onto the enabled row at `to`.
 * `arrayMove` alone would also displace disabled rows the drag passed over;
 * re-pinning them to their original indices keeps the documented contract
 * that a disabled row holds its position while others move around it.
 */
export const computeReorderedIds = (
  ids: string[],
  disabledIds: ReadonlySet<string>,
  from: number,
  to: number,
): string[] => {
  const moved = arrayMove(ids, from, to);
  if (disabledIds.size === 0) {
    return moved;
  }
  const movable = moved.filter((id) => !disabledIds.has(id));
  return ids.map((id) => (disabledIds.has(id) ? id : (movable.shift() ?? id)));
};
