import { Box, Skeleton } from "@mui/material";

import { pageIconVariantSizes } from "../../../../components/page-icon";

const LoadingLine = () => {
  return (
    <Box display="flex" alignItems="center" height={34}>
      <Skeleton
        animation="wave"
        variant="rectangular"
        sx={{
          mr: 0.75,
          height: pageIconVariantSizes.small.container,
          width: pageIconVariantSizes.small.container,
          borderRadius: 1,
        }}
      />
      <Skeleton
        variant="rectangular"
        animation="wave"
        height={pageIconVariantSizes.small.container}
        sx={{ flex: 1, borderRadius: 1 }}
      />
    </Box>
  );
};

export const PagesLoadingState = () => (
  <Box mx={0.75} px={3.5}>
    <LoadingLine />
    <LoadingLine />
    <LoadingLine />
  </Box>
);
