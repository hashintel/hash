import type { EntityId } from "@blockprotocol/type-system";
import type { EntityForGraphChart } from "@hashintel/block-design-system";
import { LoadingSpinner } from "@hashintel/design-system";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";
import { useTheme } from "@mui/material";
import { useMemo } from "react";

import { EntityGraphVisualizer } from "../../../../../shared/entity-graph-visualizer";
import { useSlideStack } from "../../../../../shared/slide-stack";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

type EntityResultGraphProps = {
  closedMultiEntityTypesRootMap?: ClosedMultiEntityTypesRootMap;
  entities: EntityForGraphChart[];
};

export const EntityResultGraph = ({
  closedMultiEntityTypesRootMap,
  entities,
}: EntityResultGraphProps) => {
  const { pushToSlideStack } = useSlideStack();

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

  if (!closedMultiEntityTypesRootMap && !entities.length) {
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
      {closedMultiEntityTypesRootMap && (
        <EntityGraphVisualizer
          closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
          entities={deduplicatedEntities}
          loadingComponent={
            <LoadingSpinner size={42} color={theme.palette.blue[60]} />
          }
          onEntityClick={(entityId) => {
            pushToSlideStack({
              kind: "entity",
              itemId: entityId,
            });
          }}
          onEntityTypeClick={(entityTypeId) => {
            pushToSlideStack({
              kind: "entityType",
              itemId: entityTypeId,
            });
          }}
        />
      )}
    </OutputContainer>
  );
};
