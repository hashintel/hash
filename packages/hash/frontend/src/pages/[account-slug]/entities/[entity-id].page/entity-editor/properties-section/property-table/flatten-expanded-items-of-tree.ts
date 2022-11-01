import { TableExpandStatus } from "../../entity-editor-context";

/**
 * @param tree a tree contains nested items
 * @param expandStatus an object stores `[string]: boolean` pairs, which represents each tree item's expanded/collapsed status.
 * For each tree item ID, it should hold `true` for expanded, `false` for collapsed
 * @param propertyUsedForExpandStatus the property key of `expandStatus` used to represent unique ID of tree items
 * @returns flattened tree
 * @example
 * ```ts
 * tree = [{ id: "1", children: [{ id: "2", children: [] }] }];
 * expandStatus = { "1": true }
 * propertyUsedForExpandStatus = "id"
 * response = [
 *  { id: "1", children: [{ id: "2", children: [] }] },
 *  { id: "2", children: [] },
 * ];
 * ```
 */
export const flattenExpandedItemsOfTree = <T extends { children: T[] }>(
  tree: T[],
  expandStatus: TableExpandStatus,
  propertyUsedForExpandStatus: keyof T,
): T[] => {
  const flattened: T[] = [];

  for (const item of tree) {
    flattened.push(item);

    const id = item[propertyUsedForExpandStatus] as string;
    const expanded = expandStatus[id];

    if (expanded) {
      flattened.push(
        ...flattenExpandedItemsOfTree(
          item.children,
          expandStatus,
          propertyUsedForExpandStatus,
        ),
      );
    }
  }

  return flattened;
};
