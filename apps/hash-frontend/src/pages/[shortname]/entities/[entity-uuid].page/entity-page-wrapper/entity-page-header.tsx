import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import { useRouter } from "next/router";
import { ReactNode, useContext } from "react";

import { TopContextBar } from "../../../../shared/top-context-bar";
import { WorkspaceContext } from "../../../../shared/workspace-context";
import { DraftEntityBanner } from "./draft-entity-banner";

export const EntityPageHeader = ({
  entity,
  entitySubgraph,
  onEntityUpdated,
  entityLabel,
  lightTitle,
  chip,
  editBar,
  isModifyingEntity,
}: {
  entity?: Entity;
  entitySubgraph?: Subgraph<EntityRootType>;
  onEntityUpdated?: (entity: Entity) => void;
  entityLabel: string;
  lightTitle?: boolean;
  chip: ReactNode;
  editBar?: ReactNode;
  isModifyingEntity?: boolean;
}) => {
  const router = useRouter();

  const paramsShortname = router.query.shortname;
  const { activeWorkspace } = useContext(WorkspaceContext);

  const shortname = paramsShortname?.slice(1) ?? activeWorkspace?.shortname;

  if (!shortname) {
    throw new Error("Cannot render before workspace is available");
  }

  return (
    <>
      <TopContextBar
        defaultCrumbIcon={null}
        item={entity}
        crumbs={[
          {
            title: "Entities",
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

      {entity && entitySubgraph ? (
        <Collapse in={entity.metadata.draft}>
          <DraftEntityBanner
            draftEntity={entity}
            draftEntitySubgraph={entitySubgraph}
            isModifyingEntity={isModifyingEntity}
            onAcceptedEntity={onEntityUpdated}
          />
        </Collapse>
      ) : null}

      {editBar}

      <Box
        py={3.75}
        sx={({ palette }) => ({ background: palette.common.white })}
      >
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
    </>
  );
};
