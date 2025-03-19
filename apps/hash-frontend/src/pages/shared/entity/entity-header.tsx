import type { ClosedMultiEntityType } from "@blockprotocol/type-system";
import {
  extractDraftIdFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@blockprotocol/type-system";
import {
  ArrowUpRightFromSquareRegularIcon,
  EntityOrTypeIcon,
} from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { getDisplayFieldsForClosedEntityType } from "@local/hash-graph-sdk/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import type { ReactNode } from "react";

import { useUserOrOrgShortnameByOwnedById } from "../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import { isItemArchived } from "../../../shared/is-archived";
import { Link } from "../../../shared/ui";
import { inSlideContainerStyles } from "../shared/slide-styles";
import { TopContextBar } from "../top-context-bar";
import { DraftEntityBanner } from "./draft-entity-banner";
import { EntityEditorTabs } from "./shared/entity-editor-tabs";

export const EntityHeader = ({
  closedMultiEntityType,
  editBar,
  entity,
  entityLabel,
  entitySubgraph,
  hideOpenInNew,
  isInSlide,
  isLocalDraft,
  isModifyingEntity,
  lightTitle,
  onDraftArchived,
  onDraftPublished,
  onUnarchived,
  showTabs,
}: {
  closedMultiEntityType?: ClosedMultiEntityType;
  editBar?: ReactNode;
  entity?: Entity;
  entityLabel: string;
  entitySubgraph?: Subgraph<EntityRootType>;
  hideOpenInNew?: boolean;
  isInSlide: boolean;
  isLocalDraft: boolean;
  isModifyingEntity?: boolean;
  lightTitle?: boolean;
  onDraftArchived: () => void;
  onDraftPublished: (entity: Entity) => void;
  onUnarchived: () => void;
  showTabs?: boolean;
}) => {
  const { shortname } = useUserOrOrgShortnameByOwnedById({
    ownedById:
      entity && !isLocalDraft
        ? extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId)
        : null,
  });

  const icon = closedMultiEntityType
    ? getDisplayFieldsForClosedEntityType(closedMultiEntityType).icon
    : null;

  const entityPath =
    entity && shortname
      ? generateEntityPath({
          shortname,
          entityId: entity.metadata.recordId.entityId,
          includeDraftId: true,
        })
      : null;

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
            id: "entityId",
            icon: (
              <EntityOrTypeIcon
                entity={entity ?? null}
                icon={icon}
                isLink={!!entity?.linkData}
                fill={({ palette }) => palette.gray[50]}
                fontSize={15}
              />
            ),
          },
        ]}
        onItemUnarchived={onUnarchived}
        scrollToTop={() => {}}
      />

      {entity && entitySubgraph && shortname && closedMultiEntityType ? (
        <Collapse
          in={
            !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId) &&
            !isItemArchived(entity)
          }
        >
          <DraftEntityBanner
            closedMultiEntityType={closedMultiEntityType}
            draftEntity={entity}
            draftEntitySubgraph={entitySubgraph}
            isModifyingEntity={isModifyingEntity}
            onDraftArchived={onDraftArchived}
            onDraftPublished={onDraftPublished}
            owningShortname={shortname}
          />
        </Collapse>
      ) : null}

      {editBar}

      <Box
        pt={3.75}
        pb={showTabs ? 0 : 7}
        sx={({ palette }) => ({ background: palette.common.white })}
      >
        <Container sx={{ ...(isInSlide ? inSlideContainerStyles : {}) }}>
          <Stack
            direction="row"
            alignItems="center"
            sx={{ color: lightTitle ? "gray.50" : "gray.90", mt: 1 }}
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
                ml: 2.5,
              }}
            >
              {entityLabel}
            </Typography>
            {entityPath && isInSlide && !hideOpenInNew && (
              <Link href={entityPath} target="_blank">
                <ArrowUpRightFromSquareRegularIcon
                  sx={{
                    fill: ({ palette }) => palette.blue[50],
                    fontSize: 24,
                    "&:hover": {
                      fill: ({ palette }) => palette.blue[70],
                    },
                    ml: 1.2,
                  }}
                />
              </Link>
            )}
          </Stack>
          {showTabs && entityPath && (
            <Box mt={7.5}>
              <EntityEditorTabs entityPath={entityPath} isInSlide={isInSlide} />
            </Box>
          )}
        </Container>
      </Box>
    </>
  );
};
