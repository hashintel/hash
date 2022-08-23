import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestEntityTypesQuery,
  GetAllLatestEntityTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { AggregateEntityTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolAggregateEntityTypes = (): {
  aggregateEntityTypes: AggregateEntityTypesMessageCallback;
} => {
  const [aggregateFn] = useLazyQuery<
    GetAllLatestEntityTypesQuery,
    GetAllLatestEntityTypesQueryVariables
  >(getAllLatestEntityTypesQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const aggregateEntityTypes = useCallback<AggregateEntityTypesMessageCallback>(
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

      /** @todo Add filtering to this aggregate query. */
      const response = await aggregateFn({
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
    [aggregateFn],
  );

  return { aggregateEntityTypes };
};
