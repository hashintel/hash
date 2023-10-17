import { useQuery } from "@apollo/client";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { Entity } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { constructMinimalUser, MinimalUser } from "../../lib/user-and-org";
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
      operation: {
        multiFilter: {
          filters: [
            entityHasEntityTypeByVersionedUrlFilter(
              types.entityType.user.entityTypeId,
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

  const { queryEntities: subgraph } = data ?? {};

  const users = useMemo(() => {
    if (!subgraph) {
      return undefined;
    }

    return getRoots(subgraph.subgraph).map((userEntity) =>
      constructMinimalUser({
        userEntity: userEntity as Entity<UserProperties>,
      }),
    );
  }, [subgraph]);

  return {
    loading,
    users,
  };
};
