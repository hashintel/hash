import { isValueEmpty } from "./is-value-empty";
import { flattenAllItemsOfTree } from "./property-table/flatten";
import type { PropertyRow } from "./property-table/types";

/**
 * Flatten given property rows, and returns the value counts.
 *
 * @param rows - Not-flattened property rows.
 */
export const getPropertyCountSummary = (rows: PropertyRow[]) => {
  let notEmptyCount = 0;
  let emptyCount = 0;

  const flattened = flattenAllItemsOfTree(rows);

  for (const row of flattened) {
    if (row.children.length === 0) {
      if (isValueEmpty(row.value)) {
        emptyCount++;
      } else {
        notEmptyCount++;
      }
    }
  }

  return {
    emptyCount,
    notEmptyCount,
    totalCount: emptyCount + notEmptyCount,
  };
};
