import { useLazyQuery } from "@apollo/client";
import { useCallback } from "react";

import {
  GetEntityWithMetadataQuery,
  GetEntityWithMetadataQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getEntityWithMetadataQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { GetEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolGetEntity = (): {
  getEntity: GetEntityMessageCallback;
} => {
  const [getEntityFn] = useLazyQuery<
    GetEntityWithMetadataQuery,
    GetEntityWithMetadataQueryVariables
  >(getEntityWithMetadataQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const getEntity = useCallback<GetEntityMessageCallback>(
    async ({ data: entityId }) => {
      if (!entityId) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getEntity",
            },
          ],
        };
      }

      const { data: response } = await getEntityFn({
        variables: {
          entityId,
          // Get the full entity type _tree_
          dataTypeResolveDepth: 255,
          propertyTypeResolveDepth: 255,
          // Don't explore entityType references beyond the absolute neighbors
          entityTypeResolveDepth: 2,
          // Only get absolute neighbor link entities and their endpoint entities
          entityResolveDepth: 2,
        },
      });

      if (!response) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getEntity",
            },
          ],
        };
      }

      const { getEntityWithMetadata: subgraph } = response;

      return {
        data: subgraph,
      };
    },
    [getEntityFn],
  );

  return { getEntity };
};
