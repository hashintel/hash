import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { Box, Paper } from "@mui/material";
import type { FunctionComponent } from "react";
import { useContext, useMemo } from "react";

import { useEntityTypeEntitiesContext } from "../../../shared/entity-type-entities-context";
import { SectionEmptyState } from "../../[shortname]/shared/section-empty-state";
import { SectionWrapper } from "../../[shortname]/shared/section-wrapper";
import { EntitiesTable } from "../entities-table";
import { WorkspaceContext } from "../workspace-context";
import { useEntityType } from "./shared/entity-type-context";

export const EntitiesTab: FunctionComponent = () => {
  const { entities, loading } = useEntityTypeEntitiesContext();

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

  const isEmpty =
    !loading && entitiesCount.namespace + entitiesCount.public === 0;

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
