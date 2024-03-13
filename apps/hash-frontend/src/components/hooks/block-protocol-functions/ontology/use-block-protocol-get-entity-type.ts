import { useLazyQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityTypeRootType } from "@local/hash-subgraph";
import { useCallback } from "react";

import type {
  GetEntityTypeQuery,
  GetEntityTypeQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getEntityTypeQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import type { GetEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetEntityType = (): {
  getEntityType: GetEntityTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<GetEntityTypeQuery, GetEntityTypeQueryVariables>(
    getEntityTypeQuery,
    {
      /**
       * Entity types are immutable, any request for an entityTypeId should always return the same value.
       * However, currently requests for non-existent entity types currently return an empty subgraph, so
       * we can't rely on this.
       *
       * @todo revert this back to cache-first once that's fixed
       */
      fetchPolicy: "network-only",
    },
  );

  const getEntityType = useCallback<GetEntityTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getEntityType",
            },
          ],
        };
      }

      const { entityTypeId, graphResolveDepths } = data;

      const response = await getFn({
        query: getEntityTypeQuery,
        variables: {
          entityTypeId,
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 1 },
          constrainsLinkDestinationsOn: { outgoing: 1 },
          inheritsFrom: { outgoing: 255 },
          ...graphResolveDepths,
        },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getEntityType",
            },
          ],
        };
      }

      /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
      const subgraph =
        mapGqlSubgraphFieldsFragmentToSubgraph<EntityTypeRootType>(
          response.data.getEntityType,
        );

      return {
        data: subgraph,
      };
    },
    [getFn],
  );

  return { getEntityType };
};
