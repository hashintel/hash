import { Row } from "./rows";

export type ColumnSortDirection = "asc" | "desc";

export interface ColumnSort<T extends string> {
  columnKey: T;
  direction: ColumnSortDirection;
}

export type SetColumnSort<T extends string> = (sort: ColumnSort<T>) => void;

export const defaultSortRows = <T extends Row>(
  rows: T[],
  sort: ColumnSort<string>,
) => {
  /**
   * cloning the array, we want to return a new array,
   * so React can run effects & update state properly
   */
  const clone = [...rows] as T[];
  return clone.sort((row1, row2) => {
    // we sort only by alphabetical order for now
    const key1 = String(row1[sort.columnKey]);
    const key2 = String(row2[sort.columnKey]);

    let comparison = key1.localeCompare(key2);

    if (sort.direction === "desc") {
      // reverse if descending
      comparison = -comparison;
    }

    return comparison;
  });
};
