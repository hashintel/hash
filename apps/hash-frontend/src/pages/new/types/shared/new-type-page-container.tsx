import { OntologyChip } from "@hashintel/design-system";
import { frontendDomain } from "@local/hash-isomorphic-utils/environment";
import { Typography } from "@mui/material";
import { Box, Container, Stack } from "@mui/system";
import { type ReactElement, useContext } from "react";

import { TopContextBar } from "../../../shared/top-context-bar";
import { WorkspaceContext } from "../../../shared/workspace-context";

type NewTypePageContainerProps = {
  form: ReactElement;
  kind: "entity" | "link" | "data";
};

export const NewTypePageContainer = ({
  form,
  kind,
}: NewTypePageContainerProps) => {
  const { activeWorkspace } = useContext(WorkspaceContext);

  if (!activeWorkspace) {
    return null;
  }

  const capitalizedKind = kind.charAt(0).toUpperCase() + kind.slice(1);

  return (
    <Stack sx={{ height: "100vh" }}>
      <Box bgcolor="white">
        <TopContextBar
          defaultCrumbIcon={null}
          crumbs={[
            {
              title: "Types",
              id: "types",
              href: "/types",
            },
            {
              title: `${capitalizedKind} types`,
              href: `/types/${kind}-type`,
              id: "entity-types",
            },
          ]}
          scrollToTop={() => {}}
        />
        <Box py={3.75}>
          <Container>
            <OntologyChip
              domain={frontendDomain}
              path={`@${activeWorkspace.shortname}/types/${kind === "link" ? "entity" : kind}-type`}
              sx={[{ marginBottom: 2 }]}
            />
            <Typography variant="h1" fontWeight="bold">
              Create new {kind} type
            </Typography>
          </Container>
        </Box>
      </Box>
      <Box
        flex={1}
        bgcolor="gray.10"
        borderTop={1}
        borderColor="gray.20"
        pt={5}
      >
        <Container>{form}</Container>
      </Box>
    </Stack>
  );
};
