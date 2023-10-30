import { useLazyQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import { getEntityQuery } from "@local/hash-graphql-shared/queries/entity.queries";
import { EntityRootType } from "@local/hash-subgraph";
import { useCallback } from "react";

import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../../../graphql/api-types.gen";
import { GetEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolGetEntity = (): {
  getEntity: GetEntityMessageCallback;
} => {
  const [getEntityFn] = useLazyQuery<GetEntityQuery, GetEntityQueryVariables>(
    getEntityQuery,
    {
      fetchPolicy: "cache-and-network",
    },
  );

  const getEntity = useCallback<GetEntityMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getEntity",
            },
          ],
        };
      }

      const { entityId, graphResolveDepths } = data;

      const { data: response } = await getEntityFn({
        variables: {
          entityId, // @todo-0.3 consider validating that this matches the id format,
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 1 },
          constrainsLinkDestinationsOn: { outgoing: 1 },
          includePermissions: false,
          inheritsFrom: { outgoing: 255 },
          isOfType: { outgoing: 1 },
          hasLeftEntity: { outgoing: 1, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 1 },
          ...graphResolveDepths,
        },
      });

      const { getEntity: subgraphAndPermissions } = response ?? {};

      if (!subgraphAndPermissions) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getEntity",
            },
          ],
        };
      }

      /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        subgraphAndPermissions.subgraph,
      );

      return { data: subgraph };
    },
    [getEntityFn],
  );

  return { getEntity };
};
