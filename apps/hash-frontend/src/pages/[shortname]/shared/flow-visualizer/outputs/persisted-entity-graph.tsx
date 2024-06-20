import type {
  EntityRootType as BpEntityRootType,
  Subgraph as BpSubgraph,
} from "@blockprotocol/graph";
import { EntitiesGraphChart } from "@hashintel/block-design-system";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { useMemo } from "react";

import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

type PersistedEntityGraphProps = {
  persistedEntities: PersistedEntity[];
  persistedEntitiesSubgraph?: Subgraph<EntityRootType>;
};

export const PersistedEntityGraph = ({
  persistedEntities,
  persistedEntitiesSubgraph,
}: PersistedEntityGraphProps) => {
  /**
   * If a Flow updates the same entity as non-draft multiple times, it will have a record of persisting
   * an entity with the same id multiple times. Duplicates crash the chart.
   * We could also deduplicate in the entities table, but having duplicates be visible there
   * will help to detect where update / deduplication logic can be improved in the inference process.
   */
  const deduplicatedPersistedEntities = useMemo(() => {
    const deduplicatedLatestEntitiesByEntityId: Record<EntityId, Entity> = {};
    for (const { entity } of persistedEntities) {
      if (!entity) {
        continue;
      }
      const persistedEntity = new Entity(entity);

      const entityId = persistedEntity.metadata.recordId.entityId;

      const existing = deduplicatedLatestEntitiesByEntityId[entityId];

      if (
        !existing ||
        existing.metadata.temporalVersioning.decisionTime.start.limit <
          persistedEntity.metadata.temporalVersioning.decisionTime.start.limit
      ) {
        deduplicatedLatestEntitiesByEntityId[entityId] = persistedEntity;
      }
    }

    return Object.values(deduplicatedLatestEntitiesByEntityId);
  }, [persistedEntities]);

  if (!persistedEntitiesSubgraph && !persistedEntities.length) {
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
        entities={deduplicatedPersistedEntities}
        subgraph={
          persistedEntitiesSubgraph as unknown as BpSubgraph<BpEntityRootType>
        } // @todo sort out this param to EntitiesGraphChart
        sx={{ maxHeight: "100%" }}
      />
    </OutputContainer>
  );
};
