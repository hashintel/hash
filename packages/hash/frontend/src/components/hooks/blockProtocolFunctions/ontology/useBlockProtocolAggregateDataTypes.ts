import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestDataTypesQuery,
  GetAllLatestDataTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestDataTypesQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { AggregateDataTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolAggregateDataTypes = (): {
  aggregateDataTypes: AggregateDataTypeMessageCallback;
} => {
  const [aggregateDataTypesQuery] = useLazyQuery<
    GetAllLatestDataTypesQuery,
    GetAllLatestDataTypesQueryVariables
  >(getAllLatestDataTypesQuery);

  const aggregateDataTypes = useCallback<AggregateDataTypeMessageCallback>(
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

      const response = await aggregateDataTypesQuery({
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
    [aggregateDataTypesQuery],
  );

  return { aggregateDataTypes };
};
