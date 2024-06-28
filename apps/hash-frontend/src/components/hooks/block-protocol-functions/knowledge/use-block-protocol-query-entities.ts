import { useLazyQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityRootType } from "@local/hash-subgraph";
import { useCallback } from "react";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import type { QueryEntitiesMessageCallback } from "./knowledge-shim";

export const useBlockProtocolQueryEntities = (): {
  queryEntities: QueryEntitiesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    fetchPolicy: "cache-and-network",
  });

  const queryEntities = useCallback<QueryEntitiesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for queryEntities",
            },
          ],
        };
      }

      const { operation, graphResolveDepths } = data;

      /**
       * @todo Add filtering to this query using structural querying.
       *   This may mean having the backend use structural querying and relaying
       *   or doing it from here.
       * @see https://linear.app/hash/issue/H-2998
       */
      const { data: response } = await queryFn({
        variables: {
          includePermissions: false,
          operation,
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 1 },
          constrainsLinkDestinationsOn: { outgoing: 1 },
          inheritsFrom: { outgoing: 255 },
          isOfType: { outgoing: 1 },
          hasLeftEntity: { outgoing: 1, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 1 },
          ...graphResolveDepths,
        },
      });

      if (!response) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling queryEntities",
            },
          ],
        };
      }

      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        response.queryEntities.subgraph,
      );

      return { data: { results: subgraph, operation } };
    },
    [queryFn],
  );

  return { queryEntities };
};
