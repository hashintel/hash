import { Container, Skeleton, Stack } from "@mui/material";

export const TypeEditorSkeleton = () => (
  <Container>
    <Stack gap={6} pt={8} sx={{ "*": { transform: "none !important" } }}>
      <Skeleton height={200} />
      <Skeleton height={90} />
      <Skeleton height={300} />
    </Stack>
  </Container>
);
