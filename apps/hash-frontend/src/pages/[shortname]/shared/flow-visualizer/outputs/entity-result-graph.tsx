import type { EntityForGraphChart } from "@hashintel/block-design-system";
import { EntitiesGraphChart } from "@hashintel/block-design-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Subgraph } from "@local/hash-subgraph";
import { useMemo } from "react";

import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

type EntityResultGraphProps = {
  onEntityClick: (entity: EntityForGraphChart) => void;
  entities: EntityForGraphChart[];
  subgraphWithTypes?: Subgraph;
};

export const EntityResultGraph = ({
  onEntityClick,
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
      if (!entity) {
        continue;
      }

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
    <OutputContainer sx={{ flex: 1.5 }}>
      <EntitiesGraphChart
        entities={deduplicatedEntities}
        onEntityClick={(entity) => onEntityClick(entity)}
        subgraphWithTypes={subgraphWithTypes}
        sx={{ maxHeight: "100%" }}
      />
    </OutputContainer>
  );
};
