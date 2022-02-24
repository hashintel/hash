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

export const useBlockProtocolAggregateEntities = (): {
  aggregateEntities: BlockProtocolAggregateEntitiesFunction;
} => {
  const client = useApolloClient();

  const aggregateEntities: BlockProtocolAggregateEntitiesFunction = useCallback(
    async (action) => {
      if (!action.accountId) {
        throw new Error("aggregateEntities needs to be passed an accountId");
      }

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
          accountId: action.accountId,
          operation: {
            ...action.operation,
            entityTypeId: action.operation.entityTypeId!,
          },
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
    [client],
  );

  return {
    aggregateEntities,
  };
};
