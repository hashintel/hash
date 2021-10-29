import { useLazyQuery } from "@apollo/client";

import { BlockProtocolAggregateFn } from "@hashintel/block-protocol";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolAggregate = (): {
  aggregate: BlockProtocolAggregateFn;
  aggregateLoading: boolean;
  aggregateError: any;
} => {
  const [aggregateFn, { loading: aggregateLoading, error: aggregateError }] =
    useLazyQuery<AggregateEntityQuery, AggregateEntityQueryVariables>(
      aggregateEntity
    );

  const aggregate: BlockProtocolAggregateFn = useCallback(
    (action) => {
      /**
       * Temporary hack while useLazyQuery doesn't return anything.
       * useLazyQuery should return a promise as of apollo-client 3.5
       * @see https://github.com/apollographql/apollo-client/issues/7714
       */
      return new Promise((resolve, reject) => {
        try {
          aggregateFn({
            variables: {
              operation: action.operation,
              entityTypeId: action.entityTypeId,
              entityTypeVersionId: action.entityTypeVersionId,
              accountId: action.accountId,
            },
          });
          resolve([]);
        } catch (err) {
          reject(err);
        }
      });
    },
    [aggregateFn]
  );

  return {
    aggregate,
    aggregateLoading,
    aggregateError,
  };
};
