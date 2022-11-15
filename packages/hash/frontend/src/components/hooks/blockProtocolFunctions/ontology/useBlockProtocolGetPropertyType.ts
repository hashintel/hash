import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetPropertyTypeQuery,
  GetPropertyTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getPropertyTypeQuery } from "../../../../graphql/queries/ontology/property-type.queries";
import { GetPropertyTypeMessageCallback } from "./ontology-types-shim";
import { Subgraph } from "../../../../lib/subgraph";

export const useBlockProtocolGetPropertyType = (): {
  getPropertyType: GetPropertyTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<
    GetPropertyTypeQuery,
    GetPropertyTypeQueryVariables
  >(getPropertyTypeQuery, {
    /**
     * Property types are immutable, any request for an propertyTypeId should always return the same value.
     * However, currently requests for non-existent property types currently return an empty subgraph, so
     * we can't rely on this.
     *
     * @todo revert this back to cache-first once that's fixed
     */
    fetchPolicy: "network-only",
  });

  const getPropertyType = useCallback<GetPropertyTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getPropertyType",
            },
          ],
        };
      }

      const { propertyTypeId } = data;

      const response = await getFn({
        variables: {
          propertyTypeId,
          dataTypeResolveDepth: 255,
          propertyTypeResolveDepth: 255,
        },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getPropertyType",
            },
          ],
        };
      }

      return {
        /**
         * @todo: remove this when we start returning links in the subgraph
         *   https://app.asana.com/0/0/1203214689883095/f
         */
        data: response.data.getPropertyType as Subgraph,
      };
    },
    [getFn],
  );

  return { getPropertyType };
};
