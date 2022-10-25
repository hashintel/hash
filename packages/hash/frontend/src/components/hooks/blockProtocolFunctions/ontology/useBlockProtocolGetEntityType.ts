import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetEntityTypeQuery,
  GetEntityTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getEntityTypeQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { GetEntityTypeMessageCallback } from "./ontology-types-shim";
import { Subgraph } from "../../../../lib/subgraph";

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

      const { entityTypeId } = data;

      const response = await getFn({
        query: getEntityTypeQuery,
        variables: {
          entityTypeId,
          dataTypeResolveDepth: 255,
          propertyTypeResolveDepth: 255,
          linkTypeResolveDepth: 255,
          entityTypeResolveDepth: 1,
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

      return {
        /**
         * @todo: remove this when we start returning links in the subgraph
         *   https://app.asana.com/0/0/1203214689883095/f
         */
        data: response.data.getEntityType as Subgraph,
      };
    },
    [getFn],
  );

  return { getEntityType };
};
