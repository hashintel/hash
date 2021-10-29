import { useApolloClient } from "@apollo/client";

import {
  BlockProtocolAggregateFn,
  BlockProtocolAggregateOperationOutput,
} from "@hashintel/block-protocol";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../../lib/entities";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolAggregate = (
  /** Providing accountId here saves blocks from having to know it */
  accountId: string
): {
  aggregate: BlockProtocolAggregateFn;
} => {
  const client = useApolloClient();

  const aggregate: BlockProtocolAggregateFn = useCallback(
    async (action) => {
      if (!action.accountId) {
        throw new Error("accountId not provided with aggregate action");
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
          operation: action.operation,
          entityTypeId: action.entityTypeId!,
          entityTypeVersionId: action.entityTypeVersionId,
          accountId,
        },
      });
      const { operation, results } = response.data.aggregateEntity;
      const newResults = results.map((result) =>
        cloneEntityTreeWithPropertiesMovedUp(result)
      );
      return {
        operation,
        results: newResults,
      } as BlockProtocolAggregateOperationOutput;
    },
    [accountId, client]
  );

  return {
    aggregate,
  };
};
