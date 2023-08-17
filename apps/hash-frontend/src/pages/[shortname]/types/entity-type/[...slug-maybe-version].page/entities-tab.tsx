import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { Box, Paper, useTheme } from "@mui/material";
import { FunctionComponent, useContext, useMemo } from "react";

import { HEADER_HEIGHT } from "../../../../../shared/layout/layout-with-header/page-header";
import { tableHeaderHeight } from "../../../../../shared/table-header";
import { EntitiesTable } from "../../../../shared/entities-table";
import { TOP_CONTEXT_BAR_HEIGHT } from "../../../../shared/top-context-bar";
import { WorkspaceContext } from "../../../../shared/workspace-context";
import { SectionEmptyState } from "../../../shared/section-empty-state";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityType } from "./shared/entity-type-context";
import { useEntityTypeEntities } from "./shared/entity-type-entities-context";

export const EntitiesTab: FunctionComponent = () => {
  const { entities } = useEntityTypeEntities();

  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const entityType = useEntityType();

  const entitiesCount = useMemo(() => {
    const namespaceEntities =
      entities?.filter(
        (entity) =>
          extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId) ===
          activeWorkspaceAccountId,
      ) ?? [];

    return {
      namespace: namespaceEntities.length,
      public: (entities?.length ?? 0) - namespaceEntities.length,
    };
  }, [entities, activeWorkspaceAccountId]);

  const isEmpty = entitiesCount.namespace + entitiesCount.public === 0;

  const theme = useTheme();

  return (
    <Box>
      <SectionWrapper
        title="Entities"
        titleTooltip={`This table lists all entities with the ‘${entityType.title}’ type that are accessible to you`}
        tooltipIcon={
          <FontAwesomeIcon icon={faCircleQuestion} sx={{ fontSize: 14 }} />
        }
      >
        {isEmpty ? (
          <Paper sx={{ overflow: "hidden" }}>
            <SectionEmptyState
              title="There are no entities of this type visible to you"
              titleIcon={
                <FontAwesomeIcon icon={faAsterisk} sx={{ fontSize: 18 }} />
              }
              description="Assigning this type to an entity will result in it being shown here"
            />
          </Paper>
        ) : (
          <EntitiesTable
            height={
              entities && entities.length > 8
                ? `calc(100vh - (${
                    HEADER_HEIGHT +
                    TOP_CONTEXT_BAR_HEIGHT +
                    215 +
                    24 +
                    tableHeaderHeight
                  }px + ${theme.spacing(5)} + ${theme.spacing(5)}))`
                : undefined
            }
          />
        )}
      </SectionWrapper>
    </Box>
  );
};
