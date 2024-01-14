export type ColumnFilter<ColumnKey extends string> = {
  columnKey: ColumnKey;
  filterItems: {
    id: string;
    label: string;
  }[];
  selectedFilterItemIds: string[];
};
