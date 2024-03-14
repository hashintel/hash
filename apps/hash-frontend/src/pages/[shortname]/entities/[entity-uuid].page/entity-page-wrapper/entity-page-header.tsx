import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { useContext } from "react";

import { NotificationsWithLinksContextProvider } from "../../../../shared/notifications-with-links-context";
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

  const paramsShortname = router.query.shortname as string | undefined;
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
            href: "/entities",
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
        <NotificationsWithLinksContextProvider>
          <Collapse
            in={!!extractDraftIdFromEntityId(entity.metadata.recordId.entityId)}
          >
            <DraftEntityBanner
              draftEntity={entity}
              draftEntitySubgraph={entitySubgraph}
              isModifyingEntity={isModifyingEntity}
              onAcceptedEntity={onEntityUpdated}
              owningShortname={shortname}
            />
          </Collapse>
        </NotificationsWithLinksContextProvider>
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
