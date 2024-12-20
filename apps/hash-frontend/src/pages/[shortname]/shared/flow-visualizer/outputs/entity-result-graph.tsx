import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { EntityForGraphChart } from "@hashintel/block-design-system";
import { LoadingSpinner } from "@hashintel/design-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Subgraph } from "@local/hash-subgraph";
import { useTheme } from "@mui/material";
import { useMemo } from "react";

import { EntityGraphVisualizer } from "../../../../shared/entity-graph-visualizer";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

type EntityResultGraphProps = {
  onEntityClick: (entityId: EntityId) => void;
  onEntityTypeClick: (entityTypeId: VersionedUrl) => void;
  entities: EntityForGraphChart[];
  subgraphWithTypes?: Subgraph;
};

export const EntityResultGraph = ({
  onEntityClick,
  onEntityTypeClick,
  entities,
  subgraphWithTypes,
}: EntityResultGraphProps) => {
  /**
   * If a Flow updates the same entity as non-draft multiple times, it will have a record of persisting
   * an entity with the same id multiple times. Duplicates crash the chart.
   * We could also deduplicate in the entities table, but having duplicates be visible there
   * will help to detect where update / deduplication logic can be improved in the inference process.
   */
  const deduplicatedEntities = useMemo(() => {
    const deduplicatedLatestEntitiesByEntityId: Record<
      EntityId,
      EntityForGraphChart
    > = {};
    for (const entity of entities) {
      const entityId = entity.metadata.recordId.entityId;

      const existing = deduplicatedLatestEntitiesByEntityId[entityId];

      if (
        !existing ||
        /**
         * If these are persisted entities, they will have temporal versions, and we can take the latest.
         * If they are proposed entities, they won't have temporal versioning (nor should they be duplicated)
         */
        (existing.metadata.temporalVersioning &&
          entity.metadata.temporalVersioning &&
          existing.metadata.temporalVersioning.decisionTime.start.limit <
            entity.metadata.temporalVersioning.decisionTime.start.limit)
      ) {
        deduplicatedLatestEntitiesByEntityId[entityId] = entity;
      }
    }

    return Object.values(deduplicatedLatestEntitiesByEntityId);
  }, [entities]);

  const theme = useTheme();

  if (!subgraphWithTypes && !entities.length) {
    return (
      <OutputContainer sx={{ flex: 1.5 }}>
        <EmptyOutputBox
          Icon={outputIcons.graph}
          label="A graph of entities saved to HASH by the flow will appear here"
        />
      </OutputContainer>
    );
  }

  return (
    <OutputContainer sx={{ flex: 1.5, width: "100%", textAlign: "initial" }}>
      {subgraphWithTypes && (
        <EntityGraphVisualizer
          entities={deduplicatedEntities}
          loadingComponent={
            <LoadingSpinner size={42} color={theme.palette.blue[60]} />
          }
          onEntityClick={onEntityClick}
          onEntityTypeClick={onEntityTypeClick}
          subgraphWithTypes={subgraphWithTypes}
        />
      )}
    </OutputContainer>
  );
};
