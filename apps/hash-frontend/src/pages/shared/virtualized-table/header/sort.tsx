import {
  ArrowUpWideShortLightIcon,
  IconButton,
} from "@hashintel/design-system";

export type VirtualizedTableSort<Id extends string = string> = {
  fieldId: Id;
  direction: "asc" | "desc";
};

export type TableSortProps<
  Sort extends VirtualizedTableSort = VirtualizedTableSort,
> = {
  sort?: Sort;
  setSort: (sort: Sort) => void;
};

export const SortButton = <Sort extends VirtualizedTableSort>({
  columnId,
  sort,
  setSort,
}: {
  columnId: NonNullable<Sort["fieldId"]>;
} & TableSortProps<Sort>) => {
  const isSorted = sort?.fieldId === columnId;
  const isSortedAscending = isSorted && sort.direction === "asc";

  return (
    <IconButton
      onClick={() =>
        setSort({
          fieldId: columnId,
          direction: isSortedAscending ? "desc" : "asc",
        } as Sort)
      }
      sx={{ p: 0.6, "& svg": { fontSize: 15 } }}
    >
      <ArrowUpWideShortLightIcon
        sx={{
          fill: ({ palette }) =>
            isSorted ? palette.blue[70] : palette.gray[50],
          transform: isSortedAscending ? "rotate(180deg)" : "rotate(0deg)",
          transition: ({ transitions }) =>
            transitions.create(["transform", "fill"]),
        }}
      />
    </IconButton>
  );
};
