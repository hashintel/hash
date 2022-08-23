import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestDataTypesQuery,
  GetAllLatestDataTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestDataTypesQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { AggregateDataTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolAggregateDataTypes = (): {
  aggregateDataTypes: AggregateDataTypesMessageCallback;
} => {
  const [aggregateFn] = useLazyQuery<
    GetAllLatestDataTypesQuery,
    GetAllLatestDataTypesQueryVariables
  >(getAllLatestDataTypesQuery);

  const aggregateDataTypes = useCallback<AggregateDataTypesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for aggregateDataTypes",
            },
          ],
        };
      }

      /** @todo Add filtering to this aggregate query. */
      const response = await aggregateFn({
        query: getAllLatestDataTypesQuery,
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling aggregateDataTypes",
            },
          ],
        };
      }

      return {
        data: {
          results: response.data.getAllLatestDataTypes,
        },
      };
    },
    [aggregateFn],
  );

  return { aggregateDataTypes };
};
