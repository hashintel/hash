import { useLazyQuery } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { useCallback } from "react";
import {
  DeprecatedGetAccountEntityTypesQuery,
  DeprecatedGetAccountEntityTypesQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { deprecatedGetAccountEntityTypes } from "../../../graphql/queries/account.queries";
import { convertApiEntityTypeToBpEntityType } from "../../../lib/entities";

export const useBlockProtocolAggregateEntityTypes = (
  accountId: string,
): {
  aggregateEntityTypes: EmbedderGraphMessageCallbacks["aggregateEntityTypes"];
} => {
  const [aggregateEntityTypesInDb] = useLazyQuery<
    DeprecatedGetAccountEntityTypesQuery,
    DeprecatedGetAccountEntityTypesQueryVariables
  >(deprecatedGetAccountEntityTypes);

  const aggregateEntityTypes = useCallback<
    EmbedderGraphMessageCallbacks["aggregateEntityTypes"]
  >(
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

      const response = await aggregateEntityTypesInDb({
        query: deprecatedGetAccountEntityTypes,
        variables: {
          accountId,
          /**
           * This will return ALL types across the entire system, rather than just the ones the account has entities of
           * This is a temporary hack to allow using all types in dogfooding / testing,
           * to be replaced by a proper API aggregateEntityTypes implementation (and fuller Block Protocol definition)
           */
          includeAllTypes: data.includeOtherTypesInUse,
        },
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

      const responseData = response.data.deprecatedGetAccountEntityTypes;

      return {
        data: {
          results: responseData.map(convertApiEntityTypeToBpEntityType),
          operation: {
            itemsPerPage: responseData.length,
            pageCount: 1,
            pageNumber: 0,
            totalCount: responseData.length,
          },
        },
      };
    },
    [accountId, aggregateEntityTypesInDb],
  );

  return { aggregateEntityTypes };
};
