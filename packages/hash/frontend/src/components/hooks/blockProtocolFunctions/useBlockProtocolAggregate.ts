import { BlockProtocolAggregatePayload } from "./../../../../../block-protocol/src/index";
import { useApolloClient } from "@apollo/client";

import { BlockProtocolAggregateFn } from "@hashintel/block-protocol";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolAggregate = (): {
  aggregate: BlockProtocolAggregateFn;
} => {
  const client = useApolloClient();

  const aggregate: BlockProtocolAggregateFn = useCallback(
    (action: BlockProtocolAggregatePayload) =>
      /**
       * Using client.query since useLazyQuery does not return anything
       * useLazyQuery should return a promise as of apollo-client 3.5
       * @see https://github.com/apollographql/apollo-client/issues/7714
       * We can possibly revert once that happens
       */
      client.query<AggregateEntityQuery, AggregateEntityQueryVariables>({
        query: aggregateEntity,
        variables: {
          operation: action.operation,
          entityTypeId: action.entityTypeId,
          entityTypeVersionId: action.entityTypeVersionId,
          accountId: action.accountId,
        },
      }),
    [client]
  );

  return {
    aggregate,
  };
};
