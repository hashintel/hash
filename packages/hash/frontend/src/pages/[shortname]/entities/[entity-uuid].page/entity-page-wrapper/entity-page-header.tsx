import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import { useRouter } from "next/router";
import { ReactNode, useContext } from "react";

import { TopContextBar } from "../../../../shared/top-context-bar";
import { WorkspaceContext } from "../../../../shared/workspace-context";

export const EntityPageHeader = ({
  entityLabel,
  lightTitle,
  chip,
  editBar,
}: {
  entityLabel: string;
  lightTitle?: boolean;
  chip: ReactNode;
  editBar?: ReactNode;
}) => {
  const router = useRouter();

  const paramsShortname = router.query.shortname;
  const { activeWorkspace } = useContext(WorkspaceContext);

  const shortname = paramsShortname?.slice(1) ?? activeWorkspace?.shortname;

  if (!shortname) {
    throw new Error("Cannot render before workspace is available");
  }

  return (
    <Box bgcolor="white">
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Entities",
            href: `/@${shortname}/entities`,
            id: "entities",
          },
          {
            title: entityLabel,
            href: "#",
            id: "entityId",
            icon: <FontAwesomeIcon icon={faAsterisk} />,
          },
        ]}
        scrollToTop={() => {}}
      />
      {editBar}
      <Box py={3.75}>
        <Container>
          {chip}
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{ color: lightTitle ? "gray.50" : "gray.90", marginTop: 2 }}
          >
            <FontAwesomeIcon icon={faAsterisk} sx={{ fontSize: 40 }} />
            <Typography variant="h1" fontWeight="bold">
              {entityLabel}
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};
