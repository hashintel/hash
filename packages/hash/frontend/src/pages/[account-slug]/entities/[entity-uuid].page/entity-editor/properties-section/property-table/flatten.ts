import { TableExpandStatus } from "../../entity-editor-context";

/**
 * @param tree a tree contains nested items
 * @param expandStatus an object stores `[string]: boolean` pairs, which represents each tree item's expanded/collapsed status.
 * For each tree item ID, it should hold `true` for expanded, `false` for collapsed
 * @returns flattened tree
 * @example
 * ```ts
 * tree = [{ rowId: "1", children: [{ rowId: "2", children: [] }] }];
 * expandStatus = { "1": true }
 * response = [
 *  { rowId: "1", children: [{ rowId: "2", children: [] }] },
 *  { rowId: "2", children: [] },
 * ];
 * ```
 */
export const flattenExpandedItemsOfTree = <
  T extends { children: T[]; rowId: string },
>(
  tree: T[],
  expandStatus: TableExpandStatus,
): T[] => {
  const flattened: T[] = [];

  for (const item of tree) {
    flattened.push(item);

    const expanded = expandStatus[item.rowId];

    if (expanded) {
      flattened.push(
        ...flattenExpandedItemsOfTree(item.children, expandStatus),
      );
    }
  }

  return flattened;
};

/**
 * Does the same as `flattenExpandedItemsOfTree`, but assumes all items are expanded
 */
export const flattenAllItemsOfTree = <T extends { children: T[] }>(
  tree: T[],
): T[] => {
  return tree.flatMap((item) => [
    item,
    ...flattenAllItemsOfTree(item.children),
  ]);
};
