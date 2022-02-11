import { useApolloClient } from "@apollo/client";

import { BlockProtocolAggregateEntityTypesFunction } from "blockprotocol";
import { useCallback } from "react";
import {
  GetAccountEntityTypesQuery,
  GetAccountEntityTypesQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { getAccountEntityTypes } from "../../../graphql/queries/account.queries";

export const useBlockProtocolAggregateEntityTypes = (): {
  aggregateEntityTypes: BlockProtocolAggregateEntityTypesFunction;
} => {
  const apolloClient = useApolloClient();

  const aggregateEntityTypes =
    useCallback<BlockProtocolAggregateEntityTypesFunction>(
      async (payload) => {
        const rawQueryResult = await apolloClient.query<
          GetAccountEntityTypesQuery,
          GetAccountEntityTypesQueryVariables
        >({
          query: getAccountEntityTypes,
          variables: {
            accountId: payload.accountId,
            includeOtherTypesInUse: payload.includeOtherTypesInUse,
          },
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
      [apolloClient],
    );

  return { aggregateEntityTypes };
};
