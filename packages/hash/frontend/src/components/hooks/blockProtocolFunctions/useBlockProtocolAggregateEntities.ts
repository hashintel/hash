import { useLazyQuery } from "@apollo/client";

import {
  AggregateEntitiesResult,
  EmbedderGraphMessageCallbacks,
  Entity,
} from "@blockprotocol/graph";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { convertApiEntityToBpEntity } from "../../../lib/entities";

export const useBlockProtocolAggregateEntities = (
  accountId: string,
): {
  aggregateEntities: EmbedderGraphMessageCallbacks["aggregateEntities"];
} => {
  const [aggregateEntitiesInDb] = useLazyQuery<
    AggregateEntityQuery,
    AggregateEntityQueryVariables
  >(aggregateEntity);

  const aggregateEntities: EmbedderGraphMessageCallbacks["aggregateEntities"] =
    useCallback(
      async ({ data }) => {
        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for aggregateEntities",
              },
            ],
          };
        }

        const { operation: requestedOperation } = data;

        const response = await aggregateEntitiesInDb({
          variables: {
            accountId,
            operation: requestedOperation,
          },
        });

        if (!response.data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "Error calling aggregateEntities",
              },
            ],
          };
        }

        const { operation: returnedOperation, results } =
          response.data.aggregateEntity;

        return {
          data: {
            operation:
              returnedOperation as AggregateEntitiesResult<Entity>["operation"],
            results: results.map(convertApiEntityToBpEntity),
          },
        };
      },
      [accountId, aggregateEntitiesInDb],
    );

  return {
    aggregateEntities,
  };
};
