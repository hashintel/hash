import { Box, Container, Skeleton, Stack, Typography } from "@mui/material";

const SectionLoadingState = ({
  width = "100%",
  height = 140,
}: {
  width?: number | string;
  height?: number;
}) => {
  return (
    <Stack gap={1.5}>
      <Typography variant="h5">
        <Skeleton width={100} variant="rounded" />
      </Typography>
      <Skeleton width={width} height={height} variant="rounded" />
    </Stack>
  );
};

export const EntityPageLoadingState = () => {
  return (
    <Stack height="100vh">
      <Box bgcolor="white">
        <Skeleton width={200} height={50} sx={{ ml: 3 }} />

        <Box py={3.75}>
          <Container>
            <Skeleton
              variant="rectangular"
              width={220}
              height={26}
              sx={{ mb: 2, borderRadius: 13 }}
            />

            <Stack>
              <Typography variant="h1">
                <Skeleton width={300} />
              </Typography>
            </Stack>
          </Container>
        </Box>
      </Box>
      <Box flex={1} bgcolor="gray.10" borderTop={1} borderColor="gray.20">
        <Container
          sx={{
            py: 5,
            display: "flex",
            flexDirection: "column",
            gap: 6.5,
          }}
        >
          <SectionLoadingState width={140} height={40} />
          <SectionLoadingState />
          <SectionLoadingState />
          <SectionLoadingState />
        </Container>
      </Box>
    </Stack>
  );
};
