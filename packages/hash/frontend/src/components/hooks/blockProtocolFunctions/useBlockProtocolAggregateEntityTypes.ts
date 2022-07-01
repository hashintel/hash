import { useLazyQuery } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { useCallback } from "react";
import {
  GetAccountEntityTypesQuery,
  GetAccountEntityTypesQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { getAccountEntityTypes } from "../../../graphql/queries/account.queries";
import { convertApiEntityTypeToBpEntityType } from "../../../lib/entities";

export const useBlockProtocolAggregateEntityTypes = (
  accountId: string,
): {
  aggregateEntityTypes: EmbedderGraphMessageCallbacks["aggregateEntityTypes"];
} => {
  const [aggregateEntityTypesInDb] = useLazyQuery<
    GetAccountEntityTypesQuery,
    GetAccountEntityTypesQueryVariables
  >(getAccountEntityTypes);

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
        query: getAccountEntityTypes,
        variables: {
          accountId,
          includeOtherTypesInUse: data.includeOtherTypesInUse,
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

      const responseData = response.data.getAccountEntityTypes;

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
