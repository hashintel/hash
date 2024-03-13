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
  previousSort?: ColumnSort<string>,
) => {
  /**
   * cloning the array, we want to return a new array,
   * so React can run effects & update state properly
   */
  const clone = [...rows] as T[];
  return clone.sort((row1, row2) => {
    // we sort only by alphabetical order for now
    const value1 = String(row1[sort.columnKey]);
    const value2 = String(row2[sort.columnKey]);

    const previousValue1 = previousSort?.columnKey
      ? String(row1[previousSort.columnKey])
      : undefined;
    const previousValue2 = previousSort?.columnKey
      ? String(row2[previousSort.columnKey])
      : undefined;

    let comparison = value1.localeCompare(value2);

    if (comparison === 0 && previousValue1 && previousValue2) {
      // if the two keys are equal, we sort by the previous sort
      comparison = previousValue1.localeCompare(previousValue2);
    }

    if (sort.direction === "desc") {
      // reverse if descending
      comparison = -comparison;
    }

    return comparison;
  });
};
