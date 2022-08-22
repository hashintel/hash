import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestEntityTypesQuery,
  GetAllLatestEntityTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { AggregateEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolAggregateEntityTypes = (): {
  aggregateEntityTypes: AggregateEntityTypeMessageCallback;
} => {
  const [aggregateEntityTypesQuery] = useLazyQuery<
    GetAllLatestEntityTypesQuery,
    GetAllLatestEntityTypesQueryVariables
  >(getAllLatestEntityTypesQuery);

  const aggregateEntityTypes = useCallback<AggregateEntityTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for aggregateEntityTypes",
            },
          ],
        };
      }

      const response = await aggregateEntityTypesQuery({
        query: getAllLatestEntityTypesQuery,
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling aggregateEntityTypes",
            },
          ],
        };
      }

      return {
        data: {
          results: response.data.getAllLatestEntityTypes,
        },
      };
    },
    [aggregateEntityTypesQuery],
  );

  return { aggregateEntityTypes };
};
