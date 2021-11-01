import { useApolloClient } from "@apollo/client";

import { BlockProtocolAggregateEntityTypesFn } from "@hashintel/block-protocol";
import { useCallback } from "react";
import {
  GetAccountEntityTypesQuery,
  GetAccountEntityTypesQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { getAccountEntityTypes } from "../../../graphql/queries/account.queries";

export const useBlockProtocolAggregateEntityTypes = (
  /** Providing accountId here saves blocks from having to know it */
  accountId: string
): {
  aggregateEntityTypes: BlockProtocolAggregateEntityTypesFn;
} => {
  const apolloClient = useApolloClient();

  const aggregateEntityTypes = useCallback<BlockProtocolAggregateEntityTypesFn>(
    async (payload) => {
      const rawQueryResult = await apolloClient.query<
        GetAccountEntityTypesQuery,
        GetAccountEntityTypesQueryVariables
      >({
        query: getAccountEntityTypes,
        variables: { accountId, ...payload },
      });

      // TODO: Consider using aggregate query to avoid result conversion on the client
      const results = rawQueryResult.data.getAccountEntityTypes;

      return {
        results: rawQueryResult.data.getAccountEntityTypes.map((item) => ({
          entityTypeId: item.entityId,
          ...item.properties,
        })),
        operation: {
          itemsPerPage: results.length,
          pageCount: 1,
          pageNumber: 0,
          totalCount: results.length,
        },
      };
    },
    [accountId, apolloClient]
  );

  return { aggregateEntityTypes };
};
