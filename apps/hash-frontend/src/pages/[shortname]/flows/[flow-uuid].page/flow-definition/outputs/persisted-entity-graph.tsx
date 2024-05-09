import { useQuery } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { EntitiesGraphChart } from "@hashintel/block-design-system";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import {
  fullOntologyResolveDepths,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { isNotNullish } from "@local/hash-isomorphic-utils/types";
import type { Entity, EntityId } from "@local/hash-subgraph";
import { useMemo } from "react";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import { queryEntityTypesQuery } from "../../../../../../graphql/queries/ontology/entity-type.queries";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

type PersistedEntityGraphProps = {
  persistedEntities: PersistedEntity[];
};

export const PersistedEntityGraph = ({
  persistedEntities,
}: PersistedEntityGraphProps) => {
  const entityTypeIds = useMemo(
    () =>
      persistedEntities
        .map(({ entity }) => entity?.metadata.entityTypeId)
        .filter(isNotNullish),
    [persistedEntities],
  );

  const { data: entityTypeResultData } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    variables: {
      filter: {
        any: entityTypeIds.map((entityTypeId) =>
          generateVersionedUrlMatchingFilter(entityTypeId, {
            ignoreParents: true,
          }),
        ),
      },
      latestOnly: true,
      ...zeroedGraphResolveDepths,
      ...fullOntologyResolveDepths,
    },
    skip: persistedEntities.length === 0,
  });

  const entityTypeSubgraph = entityTypeResultData?.queryEntityTypes;

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

      const entityId = entity.metadata.recordId.entityId;

      const existing = deduplicatedLatestEntitiesByEntityId[entityId];

      if (
        !existing ||
        existing.metadata.temporalVersioning.decisionTime.start.limit <
          entity.metadata.temporalVersioning.decisionTime.start.limit
      ) {
        deduplicatedLatestEntitiesByEntityId[entityId] = entity;
      }
    }

    return Object.values(deduplicatedLatestEntitiesByEntityId);
  }, [persistedEntities]);

  if (!entityTypeSubgraph && !persistedEntities.length) {
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
        subgraph={entityTypeSubgraph as unknown as Subgraph<EntityRootType>} // @todo sort out this param to EntitiesGraphChart
        sx={{ maxHeight: "100%" }}
      />
    </OutputContainer>
  );
};
