import { useQuery } from "@apollo/client";
import {
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { UserPermissionsOnEntities } from "@local/hash-isomorphic-utils/types";
import {
  EntityId,
  EntityRootType,
  GraphResolveDepths,
  Subgraph,
} from "@local/hash-subgraph";
import { useMemo } from "react";

import {
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
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
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
