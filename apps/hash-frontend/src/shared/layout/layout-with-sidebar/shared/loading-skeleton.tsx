import { Box, Skeleton } from "@mui/material";

import { iconVariantSizes } from "../../../edit-emoji-icon-button";

const LoadingLine = () => {
  return (
    <Box display="flex" alignItems="center" height={34}>
      <Skeleton
        animation="wave"
        variant="rectangular"
        sx={{
          mr: 0.75,
          height: iconVariantSizes.small.container,
          width: iconVariantSizes.small.container,
          borderRadius: 1,
        }}
      />
      <Skeleton
        variant="rectangular"
        animation="wave"
        height={iconVariantSizes.small.container}
        sx={{ flex: 1, borderRadius: 1 }}
      />
    </Box>
  );
};

export const LoadingSkeleton = ({ page = false }: { page?: boolean }) => (
  <Box mx={0.75} pl={page ? 3.5 : 1.5} pr={6}>
    <LoadingLine />
    <LoadingLine />
    <LoadingLine />
  </Box>
);
