import { Box, Stack } from "@mui/material";
import { Container } from "@mui/system";
import { PropsWithChildren, ReactNode } from "react";

/**
 * We'll change `[entity-uuid].page.tsx` to a tabbed page,
 * When that happens, this component will provide the tabs to each page
 */
export const EntityPageWrapper = ({
  children,
  header,
}: PropsWithChildren<{ header: ReactNode }>) => {
  return (
    <Stack minHeight="100vh">
      {header}
      <Box flex={1} bgcolor="gray.10" borderTop={1} borderColor="gray.20">
        <Container sx={{ py: 5 }}>{children}</Container>
      </Box>
    </Stack>
  );
};
