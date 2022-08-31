import { Box, Skeleton } from "@mui/material";

const LoadingLine = () => {
  return (
    <Box display="flex" alignItems="center" mb={0.4}>
      <Box
        component={Skeleton}
        mr={0.75}
        height={20}
        width={20}
        variant="circular"
      />
      <Box component={Skeleton} height={32} flex={1} />
    </Box>
  );
};

export const PagesLoadingState = () => (
  <Box sx={{ mx: 0.75, px: 3.5 }}>
    <LoadingLine />
    <LoadingLine />
    <LoadingLine />
  </Box>
);
