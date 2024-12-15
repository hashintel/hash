import { EntityOrTypeIcon } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { getDisplayFieldsForClosedEntityType } from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityType } from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { useContext } from "react";

import { TopContextBar } from "../../../../shared/top-context-bar";
import { WorkspaceContext } from "../../../../shared/workspace-context";
import { EntityEditorTabs } from "../shared/entity-editor-tabs";
import { DraftEntityBanner } from "./draft-entity-banner";

export const EntityPageHeader = ({
  closedMultiEntityType,
  entity,
  entitySubgraph,
  onEntityUpdated,
  entityLabel,
  lightTitle,
  chip,
  editBar,
  isModifyingEntity,
  showTabs,
}: {
  closedMultiEntityType?: ClosedMultiEntityType;
  entity?: Entity;
  entitySubgraph?: Subgraph<EntityRootType>;
  onEntityUpdated: ((entity: Entity) => void) | null;
  entityLabel: string;
  lightTitle?: boolean;
  chip: ReactNode;
  editBar?: ReactNode;
  isModifyingEntity?: boolean;
  showTabs?: boolean;
}) => {
  const router = useRouter();

  const paramsShortname = router.query.shortname as string | undefined;
  const { activeWorkspace } = useContext(WorkspaceContext);

  const shortname = paramsShortname?.slice(1) ?? activeWorkspace?.shortname;

  const icon = closedMultiEntityType
    ? getDisplayFieldsForClosedEntityType(closedMultiEntityType).icon
    : null;

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
            icon: (
              <EntityOrTypeIcon
                entity={entity ?? null}
                icon={icon}
                isLink={!!entity?.linkData}
                fill={({ palette }) => palette.gray[50]}
                fontSize="inherit"
              />
            ),
          },
        ]}
        scrollToTop={() => {}}
      />

      {entity && entitySubgraph ? (
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
      ) : null}

      {editBar}

      <Box
        pt={3.75}
        pb={showTabs ? 0 : 3.75}
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
            <EntityOrTypeIcon
              entity={entity ?? null}
              fill={({ palette }) => palette.gray[50]}
              icon={icon}
              isLink={!!entity?.linkData}
              fontSize={40}
            />
            <Typography
              variant="h1"
              fontWeight="bold"
              sx={{
                lineHeight: 1.2,
              }}
            >
              {entityLabel}
            </Typography>
          </Stack>
          {showTabs && (
            <Box mt={6}>
              <EntityEditorTabs />
            </Box>
          )}
        </Container>
      </Box>
    </>
  );
};
