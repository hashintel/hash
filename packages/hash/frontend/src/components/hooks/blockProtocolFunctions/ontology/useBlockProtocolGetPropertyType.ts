import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetPropertyTypeQuery,
  GetPropertyTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getPropertyTypeQuery } from "../../../../graphql/queries/ontology/property-type.queries";
import { GetPropertyTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetPropertyType = (): {
  getPropertyType: GetPropertyTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<
    GetPropertyTypeQuery,
    GetPropertyTypeQueryVariables
  >(getPropertyTypeQuery, {
    // Property types are immutable, any request for an propertyTypeId should always return the same value.
    fetchPolicy: "cache-first",
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
        variables: { propertyTypeId },
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
        data: response.data.getPropertyType,
      };
    },
    [getFn],
  );

  return { getPropertyType };
};
