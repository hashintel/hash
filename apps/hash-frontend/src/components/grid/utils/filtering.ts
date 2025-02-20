import type { GridRow } from "../grid";

export type ColumnFilter<ColumnKey extends string, Row extends GridRow> = {
  columnKey: ColumnKey;
  filterItems: {
    id: string;
    count?: number;
    doesNotApplyValue?: boolean;
    label: string;
    labelSuffix?: string;
  }[];
  selectedFilterItemIds: Set<string>;
  setSelectedFilterItemIds: (selectedFilterItemIds: Set<string>) => void;
  isRowFiltered: (row: Row) => boolean;
};
