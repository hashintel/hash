import { Box, Stack } from "@mui/material";
import { Container } from "@mui/system";
import { PropsWithChildren } from "react";
import { EntityPageHeader } from "./entity-page-header";

export const EntityPageWrapper = ({ children }: PropsWithChildren) => {
  return (
    <Stack height="100vh">
      <EntityPageHeader />
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
