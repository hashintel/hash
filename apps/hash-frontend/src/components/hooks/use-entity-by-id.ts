import { useQuery } from "@apollo/client";
import type {
  EntityRootType,
  GraphResolveDepths,
  Subgraph,
} from "@blockprotocol/graph";
import type { EntityId } from "@blockprotocol/type-system";
import type { UserPermissionsOnEntities } from "@local/hash-graph-sdk/authorization";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { useMemo } from "react";

import type {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../graphql/api-types.gen";

export const useEntityById = ({
  entityId,
  graphResolveDepths,
  includePermissions = false,
  pollInterval,
}: {
  entityId: EntityId;
  graphResolveDepths?: GraphResolveDepths;
  includePermissions?: boolean;
  pollInterval?: number;
}): {
  loading: boolean;
  entitySubgraph?: Subgraph<EntityRootType>;
  permissions?: UserPermissionsOnEntities;
} => {
  const { data, loading } = useQuery<GetEntityQuery, GetEntityQueryVariables>(
    getEntityQuery,
    {
      variables: {
        ...zeroedGraphResolveDepths,
        ...graphResolveDepths,
        entityId,
        includePermissions,
      },
      fetchPolicy: "cache-and-network",
      pollInterval,
    },
  );

  return useMemo(() => {
    const subgraph = data
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<HashEntity>>(
          data.getEntity.subgraph,
        )
      : undefined;

    return {
      loading,
      entitySubgraph: subgraph,
      permissions: data?.getEntity.userPermissionsOnEntities,
    };
  }, [loading, data]);
};
