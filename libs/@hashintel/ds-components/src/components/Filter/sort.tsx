type SortDirection = "ASCENDING" | "DESCENDING";
type Sorter<SortKey> = {
  name: string;
  sortKey: SortKey;
  directionsAvailable?: SortDirection[]; // defaults to both
};

export const Sort = <SortKey extends string = string>(_props: {
  className?: string;
  items?: Array<Sorter<SortKey>>;
  value?: { sortKey: NoInfer<SortKey>; direction: SortDirection };
  onChange?: (sortKey: NoInfer<SortKey>, direction: SortDirection) => void;
  saveSortId?: string | null; // id to save selection to localStorage
}) => {
  return <div />;
};
