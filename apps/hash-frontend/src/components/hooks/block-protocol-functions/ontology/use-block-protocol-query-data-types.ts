import { useLazyQuery } from "@apollo/client";
import type { DataTypeRootType } from "@blockprotocol/graph";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import type { QueryDataTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryDataTypes = (): {
  queryDataTypes: QueryDataTypesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    QueryDataTypesQuery,
    QueryDataTypesQueryVariables
  >(queryDataTypesQuery, {
    fetchPolicy: "cache-and-network",
  });

  const queryDataTypes = useCallback<QueryDataTypesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for queryDataTypes",
            },
          ],
        };
      }

      /**
       * @todo Add filtering to this query using structural querying.
       *   This may mean having the backend use structural querying and relaying
       *   or doing it from here.
       * @see https://linear.app/hash/issue/H-2998
       */
      const response = await queryFn({
        variables: {
          constrainsValuesOn: { outgoing: 255 },
          inheritsFrom: { outgoing: 255 },
          latestOnly: true,
        },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling queryDataTypes",
            },
          ],
        };
      }

      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<DataTypeRootType>(
        response.data.queryDataTypes,
      );

      return { data: subgraph };
    },
    [queryFn],
  );

  return { queryDataTypes };
};
