import { useLazyQuery } from "@apollo/client";
import { useCallback } from "react";

import {
  GetOutgoingPersistedLinksQuery,
  GetPersistedEntityQuery,
  QueryGetPersistedEntityArgs,
  QueryOutgoingPersistedLinksArgs,
} from "../../../../graphql/apiTypes.gen";
import {
  getOutgoingPersistedLinksQuery,
  getPersistedEntityQuery,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { Entity, GetEntityMessageCallback } from "./knowledge-shim";
import { Subgraph } from "../../../../lib/subgraph";

export const useBlockProtocolGetEntity = (): {
  getEntity: GetEntityMessageCallback;
} => {
  const [getEntityFn] = useLazyQuery<
    GetPersistedEntityQuery,
    QueryGetPersistedEntityArgs
  >(getPersistedEntityQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const [getOutgoingLinksFn] = useLazyQuery<
    GetOutgoingPersistedLinksQuery,
    QueryOutgoingPersistedLinksArgs
  >(getOutgoingPersistedLinksQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const getEntity = useCallback<GetEntityMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getEntity",
            },
          ],
        };
      }

      const { entityId } = data;

      const [{ data: entityResponseData }, { data: outgoingLinksData }] =
        await Promise.all([
          getEntityFn({
            variables: {
              entityId,
              // Get the full entity type _tree_
              dataTypeResolveDepth: 255,
              propertyTypeResolveDepth: 255,
              linkTypeResolveDepth: 255,
              // Don't explore entityType references beyond the absolute neighbors
              entityTypeResolveDepth: 2,
              // Only get absolute neighbor entities
              linkResolveDepth: 1,
              linkTargetEntityResolveDepth: 1,
            },
          }),
          getOutgoingLinksFn({ variables: { sourceEntityId: entityId } }),
        ]);

      if (!entityResponseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getEntity",
            },
          ],
        };
      }

      if (!outgoingLinksData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getOutgoingLinks",
            },
          ],
        };
      }

      // Manually patch the subgraph to add links to the inner entity
      /**
       * @todo: remove this when we start returning links in the subgraph
       *   https://app.asana.com/0/0/1203214689883095/f
       */
      const subgraph = entityResponseData.getPersistedEntity;

      for (const [vertexId, vertex] of Object.entries(subgraph.vertices)) {
        if (vertex.kind === "entity") {
          (vertex.inner as unknown as Entity).links =
            vertexId === entityId
              ? outgoingLinksData.outgoingPersistedLinks
              : [];
        }
      }

      return {
        data: subgraph as unknown as Subgraph,
      };
    },
    [getEntityFn, getOutgoingLinksFn],
  );

  return { getEntity };
};
