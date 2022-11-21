import { GridColumn } from "@glideapps/glide-data-grid";
import { RowData } from "../glide-grid";

export type TableSortType = "asc" | "desc";

export interface TableSort<T extends string> {
  key: T;
  dir: TableSortType;
}

export type SetTableSort<T extends string> = (sort: TableSort<T>) => void;

export const createHandleHeaderClicked = <T extends string>(
  columns: GridColumn[],
  sort: TableSort<T>,
  setTableSort: SetTableSort<T>,
) => {
  return (col: number) => {
    const key = columns[col]?.id as T;

    if (!key) {
      return;
    }

    const isSorted = key === sort.key;

    setTableSort({
      key,
      dir: isSorted && sort.dir === "asc" ? "desc" : "asc",
    });
  };
};

export const sortRowData = <T extends RowData>(
  rowData: T,
  sort: TableSort<string>,
) => {
  /**
   * cloning the array, we want to return a new array,
   * so React can run effects & update state properly
   */
  return [...rowData].sort((row1, row2) => {
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
