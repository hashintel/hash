import { useLazyQuery } from "@apollo/client";
import { DataTypeRootType, Subgraph } from "@local/hash-subgraph";
import { useCallback } from "react";

import {
  GetAllLatestDataTypesQuery,
  GetAllLatestDataTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getAllLatestDataTypesQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { QueryDataTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryDataTypes = (): {
  queryDataTypes: QueryDataTypesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    GetAllLatestDataTypesQuery,
    GetAllLatestDataTypesQueryVariables
  >(getAllLatestDataTypesQuery, {
    fetchPolicy: "no-cache",
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

      return {
        /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
        data: response.data.getAllLatestDataTypes as Subgraph<DataTypeRootType>,
      };
    },
    [queryFn],
  );

  return { queryDataTypes };
};
