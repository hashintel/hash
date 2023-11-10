import { useQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import {
  constructMinimalUser,
  isEntityUserEntity,
  MinimalUser,
} from "../../lib/user-and-org";
import { entityHasEntityTypeByVersionedUrlFilter } from "../../shared/filters";

export const useUsers = (): {
  loading: boolean;
  users?: MinimalUser[];
} => {
  const { data, loading } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      includePermissions: false,
      operation: {
        multiFilter: {
          filters: [
            entityHasEntityTypeByVersionedUrlFilter(
              systemTypes.entityType.user.entityTypeId,
            ),
          ],
          operator: "AND",
        },
      },
      constrainsValuesOn: { outgoing: 0 },
      constrainsPropertiesOn: { outgoing: 0 },
      constrainsLinksOn: { outgoing: 0 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      inheritsFrom: { outgoing: 0 },
      isOfType: { outgoing: 0 },
      // as there may be a lot of users, we don't fetch anything linked to them (e.g. org memberships, avatars)
      // @todo don't fetch all users, fetch a sensible short list on load and others dynamically as needed
      hasLeftEntity: { incoming: 0, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 0 },
    },
    fetchPolicy: "cache-and-network",
  });

  const { queryEntities: queryEntitiesData } = data ?? {};

  const users = useMemo(() => {
    if (!queryEntitiesData) {
      return undefined;
    }

    const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
      queryEntitiesData.subgraph,
    );

    return getRoots(subgraph).map((userEntity) => {
      if (!isEntityUserEntity(userEntity)) {
        throw new Error(
          `Entity with type ${userEntity.metadata.entityTypeId} is not a user entity`,
        );
      }

      return constructMinimalUser({ userEntity });
    });
  }, [queryEntitiesData]);

  return {
    loading,
    users,
  };
};
