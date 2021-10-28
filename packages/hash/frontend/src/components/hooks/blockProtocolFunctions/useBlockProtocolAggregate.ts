import { cloneEntityTreeWithPropertiesMovedUp } from "./../../../lib/entities";
import { useApolloClient } from "@apollo/client";

import {
  BlockProtocolAggregateFn,
  BlockProtocolAggregateOperationOutput,
} from "@hashintel/block-protocol";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback, useState } from "react";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolAggregate = (): {
  aggregate: BlockProtocolAggregateFn;
} => {
  const client = useApolloClient();

  const aggregate: BlockProtocolAggregateFn = useCallback(
    async (action) => {
      try {
        /**
         * Using client.query since useLazyQuery does not return anything
         * useLazyQuery should return a promise as of apollo-client 3.5
         * @see https://github.com/apollographql/apollo-client/issues/7714
         * We can possibly revert once that happens
         */
        const result = await client.query<
          AggregateEntityQuery,
          AggregateEntityQueryVariables
        >({
          query: aggregateEntity,
          variables: {
            operation: action.operation,
            entityTypeId: action.entityTypeId!,
            entityTypeVersionId: action.entityTypeVersionId,
            accountId: action.accountId!,
          },
        });
        let { operation, results } = result.data.aggregateEntity;
        const newResults = results.map((result) =>
          cloneEntityTreeWithPropertiesMovedUp(result)
        );
        return {
          operation,
          results: newResults,
        } as BlockProtocolAggregateOperationOutput;
      } catch (err) {
        throw err;
      }
    },
    [client]
  );

  return {
    aggregate,
  };
};
