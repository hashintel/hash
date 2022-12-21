import { isValueEmpty } from "./is-value-empty";
import { flattenAllItemsOfTree } from "./property-table/flatten";
import { PropertyRow } from "./property-table/types";

/**
 * flatten given property rows, and returns the value counts
 * @param rows not-flattened property rows
 */
export const getPropertyCountSummary = (rows: PropertyRow[]) => {
  let notEmptyCount = 0;
  let emptyCount = 0;

  const flattened = flattenAllItemsOfTree(rows);

  for (const row of flattened) {
    if (!row.children.length) {
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
