import { useQuery } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { EntitiesGraphChart } from "@hashintel/block-design-system";
import {
  fullOntologyResolveDepths,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { Entity, EntityId } from "@local/hash-subgraph";
import type { SxProps, Theme } from "@mui/material";
import { Box } from "@mui/material";
import { useMemo } from "react";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";

type PersistedEntityGraphProps = {
  persistedEntities: Entity[];
};

const containerSx = {
  height: "100%",
  width: "100%",
  background: ({ palette }) => palette.common.white,
  border: ({ palette }) => `1px solid ${palette.gray[20]}`,
  borderRadius: 2,
} satisfies SxProps<Theme>;

export const PersistedEntityGraph = ({
  persistedEntities,
}: PersistedEntityGraphProps) => {
  const entityTypeIds = persistedEntities.map(
    (entity) => entity.metadata.entityTypeId,
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
    for (const entity of persistedEntities) {
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
    return <Box sx={containerSx} />;
  }

  return (
    <EntitiesGraphChart
      entities={deduplicatedPersistedEntities}
      sx={containerSx}
      subgraph={entityTypeSubgraph as unknown as Subgraph<EntityRootType>} // @todo sort out this param to EntitiesGraphChart
    />
  );
};
