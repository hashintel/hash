import { Box, Skeleton } from "@mui/material";
import { FunctionComponent } from "react";

import { GridViewItemWrapper } from "./grid-view-item-wrapper";

export const GridViewItemSkeleton: FunctionComponent<{
  numberOfItems: number;
  index: number;
}> = ({ numberOfItems, index }) => (
  <GridViewItemWrapper
    numberOfItems={numberOfItems}
    index={index}
    sx={{ padding: 3 }}
  >
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 1,
      }}
    >
      <Skeleton
        width={100}
        height={100}
        sx={{
          transform: "none",
          borderRadius: "16px",
        }}
      />
    </Box>
    <Box display="flex" justifyContent="center">
      <Skeleton width="75%" />
    </Box>
  </GridViewItemWrapper>
);
