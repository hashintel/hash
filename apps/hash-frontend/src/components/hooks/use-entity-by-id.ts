import { useQuery } from "@apollo/client";
import { UserPermissionsOnEntities } from "@local/hash-graphql-shared/graphql/types";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
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
import { getEntityQuery } from "../../graphql/queries/knowledge/entity.queries";

export const useEntityById = ({
  entityId,
  graphResolveDepths,
  includePermissions,
}: {
  entityId: EntityId;
  graphResolveDepths?: GraphResolveDepths;
  includePermissions?: boolean;
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
    },
  );

  return useMemo(
    () => ({
      loading,
      entitySubgraph: data?.getEntity.subgraph as
        | Subgraph<EntityRootType>
        | undefined,
      permissions: data?.getEntity.permissionsOnEntities,
    }),
    [loading, data],
  );
};
