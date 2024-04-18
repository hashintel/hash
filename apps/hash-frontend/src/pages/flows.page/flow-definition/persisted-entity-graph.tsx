import { useQuery } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { EntitiesGraphChart } from "@hashintel/block-design-system";
import {
  fullOntologyResolveDepths,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { Entity } from "@local/hash-subgraph";
import type { SxProps, Theme } from "@mui/material";
import { Box } from "@mui/material";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../graphql/api-types.gen";
import { queryEntityTypesQuery } from "../../../graphql/queries/ontology/entity-type.queries";

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

  if (!entityTypeSubgraph && !persistedEntities.length) {
    return <Box sx={containerSx} />;
  }

  return (
    <EntitiesGraphChart
      entities={persistedEntities}
      sx={containerSx}
      subgraph={entityTypeSubgraph as unknown as Subgraph<EntityRootType>} // @todo sort out this param to EntitiesGraphChart
    />
  );
};
