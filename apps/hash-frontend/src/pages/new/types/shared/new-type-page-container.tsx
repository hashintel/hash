import { Typography } from "@mui/material";
import { Box, Container, Stack } from "@mui/system";
import { type ReactElement, useContext } from "react";

import { OntologyChip } from "@hashintel/design-system";
import { frontendDomain } from "@local/hash-isomorphic-utils/environment";

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
            {kind !== "data" ? (
              <OntologyChip
                domain={frontendDomain}
                path={`@${activeWorkspace.shortname}/types/${kind === "link" ? "entity" : kind}-type`}
                sx={[{ marginBottom: 2 }]}
              />
            ) : (
              // The chip row's 26px + its 16px margin, so this header keeps
              // the same height as the other create pages'
              <Box height={42} />
            )}
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
