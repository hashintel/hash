import { useLazyQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import { assertDataTypeRootedSubgraph } from "@local/hash-subgraph/stdlib";
import { useCallback } from "react";

import {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { QueryDataTypesMessageCallback } from "./ontology-types-shim";

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
       *   https://app.asana.com/0/1202805690238892/1202890614880643/f
       */
      const response = await queryFn({
        variables: {
          constrainsValuesOn: { outgoing: 255 },
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

      /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph(
        response.data.queryDataTypes,
      );

      assertDataTypeRootedSubgraph(subgraph);

      return { data: subgraph };
    },
    [queryFn],
  );

  return { queryDataTypes };
};
