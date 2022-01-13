import { useApolloClient } from "@apollo/client";

import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolAggregateEntitiesResult,
} from "blockprotocol";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../../lib/entities";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolAggregateEntities = (
  /** Providing accountId here saves blocks from having to know it */
  accountId: string,
): {
  aggregateEntities: BlockProtocolAggregateEntitiesFunction;
} => {
  const client = useApolloClient();

  const aggregateEntities: BlockProtocolAggregateEntitiesFunction = useCallback(
    async (action) => {
      /**
       * Using client.query since useLazyQuery does not return anything
       * useLazyQuery should return a promise as of apollo-client 3.5
       * @see https://github.com/apollographql/apollo-client/issues/7714
       * We can possibly revert once that happens
       */
      const response = await client.query<
        AggregateEntityQuery,
        AggregateEntityQueryVariables
      >({
        query: aggregateEntity,
        variables: {
          operation: {
            ...action.operation,
            entityTypeId: action.operation.entityTypeId!,
          },
          accountId,
        },
      });
      const { operation, results } = response.data.aggregateEntity;
      const newResults = results.map((result) =>
        cloneEntityTreeWithPropertiesMovedUp(result),
      );
      return {
        operation,
        results: newResults,
      } as BlockProtocolAggregateEntitiesResult;
    },
    [accountId, client],
  );

  return {
    aggregateEntities,
  };
};
