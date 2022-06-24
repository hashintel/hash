import { useLazyQuery } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";

export const useBlockProtocolAggregateEntities = (): {
  aggregateEntities: EmbedderGraphMessageCallbacks["aggregateEntities"];
} => {
  const [aggregateEntitiesInDb] = useLazyQuery(aggregateEntity);

  const aggregateEntities: EmbedderGraphMessageCallbacks["aggregateEntities"] =
    useCallback(
      async ({ data }) => {
        if (!data) {
          throw new Error("'data' must be provided for aggregateEntities");
        }

        const response = await aggregateEntitiesInDb({
          variables: {
            accountId: data.accountId,
            operation: {
              ...data.operation,
              entityTypeId: data.operation.entityTypeId!,
            },
          },
        });

        const { operation, results } = response.data.aggregateEntity;

        return {
          data: {
            operation,
            results,
          },
        };
      },
      [aggregateEntitiesInDb],
    );

  return {
    aggregateEntities,
  };
};
