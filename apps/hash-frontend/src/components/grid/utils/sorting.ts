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
  return rows.toSorted((row1, row2) => {
    const value1 = row1[sort.columnKey];
    const value2 = row2[sort.columnKey];

    if (typeof value1 === "number" && typeof value2 === "number") {
      const difference =
        (value1 - value2) * (sort.direction === "asc" ? 1 : -1);
      return difference;
    }

    // we sort only by alphabetical order for now
    const stringValue1 = String(row1[sort.columnKey]);
    const stringValue2 = String(row2[sort.columnKey]);

    const previousValue1 = previousSort?.columnKey
      ? String(row1[previousSort.columnKey])
      : undefined;
    const previousValue2 = previousSort?.columnKey
      ? String(row2[previousSort.columnKey])
      : undefined;

    let comparison = stringValue1.localeCompare(stringValue2);

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
