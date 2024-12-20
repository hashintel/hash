import { Skeleton } from "@hashintel/design-system";
import type { SxProps, Theme } from "@mui/material";
import { Box, Stack } from "@mui/material";

import { a4Ratio, thumbnailWidth } from "./dimensions";

export const PdfPreviewSkeleton = ({
  pageWidth,
  pageContainerHeight,
  sx,
}: {
  pageWidth: number;
  pageContainerHeight: number;
  sx: SxProps<Theme>;
}) => {
  return (
    <Box sx={{ height: "100%", width: "100%" }}>
      <Stack direction="row" sx={{ width: "100%" }}>
        <Stack gap={2} sx={sx}>
          <Skeleton height={thumbnailWidth * a4Ratio} width={thumbnailWidth} />
          <Skeleton height={thumbnailWidth * a4Ratio} width={thumbnailWidth} />
          <Skeleton height={thumbnailWidth * a4Ratio} width={thumbnailWidth} />
          <Skeleton height={thumbnailWidth * a4Ratio} width={thumbnailWidth} />
          <Skeleton height={thumbnailWidth * a4Ratio} width={thumbnailWidth} />
        </Stack>
        <Stack flex={1} justifyContent="center" alignItems="center">
          <Skeleton
            height={pageContainerHeight - 2}
            width={pageWidth}
            style={{ display: "block" }}
          />
        </Stack>
      </Stack>
    </Box>
  );
};
