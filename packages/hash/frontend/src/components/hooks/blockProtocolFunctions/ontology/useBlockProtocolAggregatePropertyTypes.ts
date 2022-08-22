import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestPropertyTypesQuery,
  GetAllLatestPropertyTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestPropertyTypesQuery } from "../../../../graphql/queries/ontology/property-type.queries";
import { AggregatePropertyTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolAggregatePropertyTypes = (): {
  aggregatePropertyTypes: AggregatePropertyTypeMessageCallback;
} => {
  const [aggregatePropertyTypesQuery] = useLazyQuery<
    GetAllLatestPropertyTypesQuery,
    GetAllLatestPropertyTypesQueryVariables
  >(getAllLatestPropertyTypesQuery);

  const aggregatePropertyTypes =
    useCallback<AggregatePropertyTypeMessageCallback>(
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

        const response = await aggregatePropertyTypesQuery({
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
      [aggregatePropertyTypesQuery],
    );

  return { aggregatePropertyTypes };
};
