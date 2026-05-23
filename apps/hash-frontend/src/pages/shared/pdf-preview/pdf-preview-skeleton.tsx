import { Box, Stack } from "@mui/material";

import { Skeleton } from "@hashintel/design-system";

import { a4Ratio, thumbnailWidth } from "./dimensions";

import type { SxProps, Theme } from "@mui/material";

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
