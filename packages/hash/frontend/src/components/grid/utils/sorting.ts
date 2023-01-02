import { GridColumn } from "@glideapps/glide-data-grid";

import { Rows } from "./rows";

export type ColumnSortType = "asc" | "desc";

export interface ColumnSort<T extends string> {
  key: T;
  dir: ColumnSortType;
}

export type SetColumnSort<T extends string> = (sort: ColumnSort<T>) => void;

export const createHandleHeaderClicked = <T extends string>(
  columns: GridColumn[],
  sort: ColumnSort<T>,
  setColumnSort: SetColumnSort<T>,
) => {
  return (colIndex: number) => {
    const key = columns[colIndex]?.id as T;

    if (!key) {
      return;
    }

    const isSorted = key === sort.key;

    setColumnSort({
      key,
      dir: isSorted && sort.dir === "asc" ? "desc" : "asc",
    });
  };
};

export const defaultSortRows = <T extends Rows>(
  rows: T,
  sort: ColumnSort<string>,
) => {
  /**
   * cloning the array, we want to return a new array,
   * so React can run effects & update state properly
   */
  const clone = [...rows] as T;
  return clone.sort((row1, row2) => {
    // we sort only by alphabetical order for now
    const key1 = String(row1[sort.key]);
    const key2 = String(row2[sort.key]);
    let comparison = key1.localeCompare(key2);

    if (sort.dir === "desc") {
      // reverse if descending
      comparison = -comparison;
    }

    return comparison;
  });
};
