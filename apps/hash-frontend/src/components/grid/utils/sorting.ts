import type { SizedGridColumn } from "@glideapps/glide-data-grid";

import type { GridRow } from "../grid";

export type ColumnSortDirection = "asc" | "desc";

export interface ColumnSort<S extends string> {
  columnKey: S;
  direction: ColumnSortDirection;
}

export const defaultSortRows = <
  Row extends GridRow,
  Column extends SizedGridColumn,
  Sortable extends Column["id"],
>(
  rows: Row[],
  sort: ColumnSort<Sortable>,
) => {
  return rows.toSorted((row1, row2) => {
    const value1 = row1[sort.columnKey as keyof Row];
    const value2 = row2[sort.columnKey as keyof Row];

    if (typeof value1 === "number" && typeof value2 === "number") {
      const difference =
        (value1 - value2) * (sort.direction === "asc" ? 1 : -1);
      return difference;
    }

    // we sort only by alphabetical order for now
    const stringValue1 = String(row1[sort.columnKey as keyof Row]);
    const stringValue2 = String(row2[sort.columnKey as keyof Row]);
    let comparison = stringValue1.localeCompare(stringValue2);

    if (sort.direction === "desc") {
      // reverse if descending
      comparison = -comparison;
    }

    return comparison;
  });
};
