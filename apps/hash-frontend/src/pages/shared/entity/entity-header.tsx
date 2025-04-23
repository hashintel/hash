import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { ClosedMultiEntityType } from "@blockprotocol/type-system";
import {
  extractDraftIdFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import {
  ArrowUpRightFromSquareRegularIcon,
  EntityOrTypeIcon,
} from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { getDisplayFieldsForClosedEntityType } from "@local/hash-graph-sdk/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import { type ReactNode, useRef } from "react";

import { useUserOrOrgShortnameByWebId } from "../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import { isItemArchived } from "../../../shared/is-archived";
import { Link } from "../../../shared/ui";
import { inSlideContainerStyles } from "../shared/slide-styles";
import { TopContextBar } from "../top-context-bar";
import { useTextSize } from "../use-text-size";
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
  entity?: HashEntity;
  entityLabel: string;
  entitySubgraph?: Subgraph<EntityRootType<HashEntity>>;
  hideOpenInNew?: boolean;
  isInSlide: boolean;
  isLocalDraft: boolean;
  isModifyingEntity?: boolean;
  lightTitle?: boolean;
  onDraftArchived: () => void;
  onDraftPublished: (entity: HashEntity) => void;
  onUnarchived: () => void;
  showTabs?: boolean;
}) => {
  const { shortname } = useUserOrOrgShortnameByWebId({
    webId:
      entity && !isLocalDraft
        ? extractWebIdFromEntityId(entity.metadata.recordId.entityId)
        : null,
  });

  const icon = closedMultiEntityType
    ? getDisplayFieldsForClosedEntityType(closedMultiEntityType).icon
    : null;

  const entityNameTextRef = useRef<HTMLHeadingElement | null>(null);

  const entityNameTextSize = useTextSize(entityNameTextRef);

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
            sx={{ color: lightTitle ? "gray.50" : "gray.90", mt: 1 }}
          >
            {entityNameTextSize !== null && (
              <EntityOrTypeIcon
                entity={entity ?? null}
                fill={({ palette }) => palette.gray[50]}
                icon={icon}
                isLink={!!entity?.linkData}
                fontSize={40}
                sx={{
                  position: "relative",
                  top: entityNameTextSize.lineHeight / 2 - 20,
                }}
              />
            )}
            <Box position="relative" ml={2.5}>
              <Typography
                variant="h1"
                fontWeight="bold"
                ref={entityNameTextRef}
                sx={{
                  lineHeight: 1.2,
                }}
              >
                {entityLabel}
              </Typography>
              {entityPath &&
                isInSlide &&
                !hideOpenInNew &&
                entityNameTextSize !== null && (
                  <Link
                    href={entityPath}
                    target="_blank"
                    sx={{
                      position: "absolute",
                      left: entityNameTextSize.lastLineWidth + 20,
                      top:
                        entityNameTextSize.lastLineTop +
                        /**
                         * The vertical center of the text plus offset half the icon size
                         */
                        (entityNameTextSize.lineHeight / 2 - 12),
                    }}
                  >
                    <ArrowUpRightFromSquareRegularIcon
                      sx={{
                        fill: ({ palette }) => palette.blue[50],
                        fontSize: 24,
                        "&:hover": {
                          fill: ({ palette }) => palette.blue[70],
                        },
                      }}
                    />
                  </Link>
                )}
            </Box>
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
