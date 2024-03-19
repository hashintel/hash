import type { Row } from "./rows";

export type ColumnFilter<
  ColumnKey extends string,
  RowType extends Row & { rowId: string } = Row & { rowId: string },
> = {
  columnKey: ColumnKey;
  filterItems: {
    id: string;
    label: string;
  }[];
  selectedFilterItemIds: string[];
  setSelectedFilterItemIds: (selectedFilterItemIds: string[]) => void;
  isRowFiltered: (row: RowType) => boolean;
};
