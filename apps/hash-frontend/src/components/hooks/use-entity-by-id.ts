import { useQuery } from "@apollo/client";
import { UserPermissionsOnEntities } from "@local/hash-graphql-shared/graphql/types";
import { getEntityQuery } from "@local/hash-graphql-shared/queries/entity.queries";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import {
  EntityId,
  EntityRootType,
  GraphResolveDepths,
  Subgraph,
} from "@local/hash-subgraph";
import { assertEntityRootedSubgraph } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../graphql/api-types.gen";

export const useEntityById = ({
  entityId,
  graphResolveDepths,
  includePermissions = false,
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

  return useMemo(() => {
    const { subgraph } = data?.getEntity ?? {};

    if (subgraph) {
      assertEntityRootedSubgraph(subgraph);
    }

    return {
      loading,
      entitySubgraph: subgraph,
      permissions: data?.getEntity.userPermissionsOnEntities,
    };
  }, [loading, data]);
};
