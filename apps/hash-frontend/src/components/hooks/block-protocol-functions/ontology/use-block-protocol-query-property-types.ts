import { useLazyQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import type { PropertyTypeRootType } from "@local/hash-subgraph";
import { useCallback } from "react";

import type {
  QueryPropertyTypesQuery,
  QueryPropertyTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryPropertyTypesQuery } from "../../../../graphql/queries/ontology/property-type.queries";
import type { QueryPropertyTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryPropertyTypes = (): {
  queryPropertyTypes: QueryPropertyTypesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    QueryPropertyTypesQuery,
    QueryPropertyTypesQueryVariables
  >(queryPropertyTypesQuery, {
    fetchPolicy: "cache-and-network",
  });

  const queryPropertyTypes = useCallback<QueryPropertyTypesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for queryPropertyTypes",
            },
          ],
        };
      }

      const { graphResolveDepths, includeArchived, latestOnly } = data;
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
          ...graphResolveDepths,
          includeArchived,
          latestOnly,
        },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling queryPropertyTypes",
            },
          ],
        };
      }

      /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
      const subgraph =
        mapGqlSubgraphFieldsFragmentToSubgraph<PropertyTypeRootType>(
          response.data.queryPropertyTypes,
        );

      return { data: subgraph };
    },
    [queryFn],
  );

  return { queryPropertyTypes };
};
