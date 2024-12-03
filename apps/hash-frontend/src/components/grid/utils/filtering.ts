import type { Row } from "./rows";

export type ColumnFilter<
  ColumnKey extends string,
  RowType extends Row & { rowId: string } = Row & { rowId: string },
> = {
  columnKey: ColumnKey;
  filterItems: {
    id: string;
    doesNotApplyValue?: boolean;
    label: string;
    count?: number;
  }[];
  selectedFilterItemIds: Set<string>;
  setSelectedFilterItemIds: (selectedFilterItemIds: Set<string>) => void;
  isRowFiltered: (row: RowType) => boolean;
};
