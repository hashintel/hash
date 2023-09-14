import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { Box, Paper } from "@mui/material";
import { FunctionComponent, useContext, useMemo } from "react";

import { useEntityTypeEntities } from "../../../../../shared/entity-type-entities-context";
import { EntitiesTable } from "../../../../shared/entities-table";
import { WorkspaceContext } from "../../../../shared/workspace-context";
import { SectionEmptyState } from "../../../shared/section-empty-state";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityType } from "./shared/entity-type-context";

export const EntitiesTab: FunctionComponent = () => {
  const { entities } = useEntityTypeEntities();

  const { activeWorkspaceOwnedById } = useContext(WorkspaceContext);

  const entityType = useEntityType();

  const entitiesCount = useMemo(() => {
    const namespaceEntities =
      entities?.filter(
        (entity) =>
          extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId) ===
          activeWorkspaceOwnedById,
      ) ?? [];

    return {
      namespace: namespaceEntities.length,
      public: (entities?.length ?? 0) - namespaceEntities.length,
    };
  }, [entities, activeWorkspaceOwnedById]);

  const isEmpty = entitiesCount.namespace + entitiesCount.public === 0;

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
              description="Assigning this type to an entity will result in it being shown here"
            />
          </Paper>
        ) : (
          <EntitiesTable />
        )}
      </SectionWrapper>
    </Box>
  );
};
