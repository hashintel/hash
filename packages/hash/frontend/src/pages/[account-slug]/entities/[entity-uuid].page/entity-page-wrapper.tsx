import { Box, Stack } from "@mui/material";
import { Container } from "@mui/system";
import { PropsWithChildren } from "react";
import { EntityPageHeader } from "./entity-page-wrapper/entity-page-header";

/**
 * We'll change `[entity-uuid].page.tsx` to a tabbed page,
 * When that happens, this component will provide the tabs to each page
 */
export const EntityPageWrapper = ({
  children,
  label,
  lightTitle,
}: PropsWithChildren<{ label: string; lightTitle?: boolean }>) => {
  return (
    <Stack minHeight="100vh">
      <EntityPageHeader entityLabel={label} lightTitle={lightTitle} />
      <Box flex={1} bgcolor="gray.10" borderTop={1} borderColor="gray.20">
        <Container
          sx={{
            py: 5,
            display: "flex",
            flexDirection: "column",
            gap: 6.5,
          }}
        >
          {children}
        </Container>
      </Box>
    </Stack>
  );
};
