import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestPropertyTypesQuery,
  GetAllLatestPropertyTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestPropertyTypesQuery } from "../../../../graphql/queries/ontology/property-type.queries";
import { AggregatePropertyTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolAggregatePropertyTypes = (): {
  aggregatePropertyTypes: AggregatePropertyTypesMessageCallback;
} => {
  const [aggregateFn] = useLazyQuery<
    GetAllLatestPropertyTypesQuery,
    GetAllLatestPropertyTypesQueryVariables
  >(getAllLatestPropertyTypesQuery);

  const aggregatePropertyTypes =
    useCallback<AggregatePropertyTypesMessageCallback>(
      async ({ data }) => {
        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for aggregatePropertyTypes",
              },
            ],
          };
        }

        const response = await aggregateFn({
          query: getAllLatestPropertyTypesQuery,
        });

        if (!response.data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "Error calling aggregatePropertyTypes",
              },
            ],
          };
        }

        return {
          data: {
            results: response.data.getAllLatestPropertyTypes,
          },
        };
      },
      [aggregateFn],
    );

  return { aggregatePropertyTypes };
};
