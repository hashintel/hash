import { useApolloClient, useLazyQuery } from "@apollo/client";

import { BlockProtocolAggregateFn } from "@hashintel/block-protocol";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolAggregate = (): {
  aggregate: BlockProtocolAggregateFn;
  // aggregateLoading: boolean;
  // aggregateError: any;
} => {
  const client = useApolloClient();
  // const [aggregateFn, { loading: aggregateLoading, error: aggregateError }] =
  //   useLazyQuery<AggregateEntityQuery, AggregateEntityQueryVariables>(
  //     aggregateEntity
  //   );

  const aggregateFn = useCallback(
    (action) =>
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

  const aggregate: BlockProtocolAggregateFn = useCallback(
    (action) => {
      /**
       * Temporary hack while useLazyQuery doesn't return anything.
       * useLazyQuery should return a promise as of apollo-client 3.5
       * @see https://github.com/apollographql/apollo-client/issues/7714
       */
      return aggregateFn({
        variables: {
          operation: action.operation,
          entityTypeId: action.entityTypeId,
          entityTypeVersionId: action.entityTypeVersionId,
          accountId: action.accountId,
        },
      });
    },
    [aggregateFn]
  );

  return {
    aggregate,
    // aggregateLoading,
    // aggregateError,
  };
};
