import { useLazyQuery } from "@apollo/client";
import type { EntityTypeRootType } from "@blockprotocol/graph";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import type { QueryEntityTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryEntityTypes = (): {
  queryEntityTypes: QueryEntityTypesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
  });

  const queryEntityTypes = useCallback<QueryEntityTypesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for queryEntityTypes",
            },
          ],
        };
      }

      const { graphResolveDepths, latestOnly, includeArchived } = data;

      /**
       * @todo Add filtering to this query using structural querying.
       *   This may mean having the backend use structural querying and relaying
       *   or doing it from here.
       * @see https://linear.app/hash/issue/H-2998
       */
      const response = await queryFn({
        variables: {
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 1 },
          constrainsLinkDestinationsOn: { outgoing: 1 },
          inheritsFrom: { outgoing: 255 },
          ...graphResolveDepths,
          latestOnly,
          includeArchived,
        },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling queryEntityTypes",
            },
          ],
        };
      }

      const subgraph =
        mapGqlSubgraphFieldsFragmentToSubgraph<EntityTypeRootType>(
          response.data.queryEntityTypes,
        );

      return { data: subgraph };
    },
    [queryFn],
  );

  return { queryEntityTypes };
};
