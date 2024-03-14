import type { Row } from "./rows";

export type ColumnSortDirection = "asc" | "desc";

export interface ColumnSort<T extends string> {
  columnKey: T;
  direction: ColumnSortDirection;
}

export type SetColumnSort<T extends string> = (sort: ColumnSort<T>) => void;

export const defaultSortRows = <T extends Row>(
  rows: T[],
  sort: ColumnSort<string>,
  previousSort?: ColumnSort<string>,
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

    const previousKey1 = previousSort?.columnKey
      ? String(row1[previousSort.columnKey])
      : undefined;
    const previousKey2 = previousSort?.columnKey
      ? String(row2[previousSort.columnKey])
      : undefined;

    let comparison = key1.localeCompare(key2);

    if (comparison === 0 && previousKey1 && previousKey2) {
      // if the two keys are equal, we sort by the previous sort
      comparison = previousKey1.localeCompare(previousKey2);
    }

    if (sort.direction === "desc") {
      // reverse if descending
      comparison = -comparison;
    }

    return comparison;
  });
};
