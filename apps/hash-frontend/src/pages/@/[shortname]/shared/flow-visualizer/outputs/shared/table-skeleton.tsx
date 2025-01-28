import { Skeleton } from "@hashintel/design-system";
import { Stack } from "@mui/material";

export const TableSkeleton = ({
  cellHeight,
  tableHeight,
}: {
  cellHeight: number;
  tableHeight: number;
}) => {
  return (
    <Stack px={1}>
      {Array(Math.floor(tableHeight / cellHeight))
        .fill(0)
        .map((_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={index} height={cellHeight - 6} />
        ))}
    </Stack>
  );
};
