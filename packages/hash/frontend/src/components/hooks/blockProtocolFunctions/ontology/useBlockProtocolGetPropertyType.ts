import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetPropertyTypeQuery,
  GetPropertyTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getPropertyTypeQuery } from "../../../../graphql/queries/ontology/property-type.queries";
import { GetPropertyTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetPropertyType = (): {
  aggregatePropertyTypes: GetPropertyTypeMessageCallback;
} => {
  const [aggregatePropertyTypesQuery] = useLazyQuery<
    GetPropertyTypeQuery,
    GetPropertyTypeQueryVariables
  >(getPropertyTypeQuery);

  const aggregatePropertyTypes = useCallback<GetPropertyTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for aggregatePropertyTypes",
            },
          ],
        };
      }

      const response = await aggregatePropertyTypesQuery({
        query: getPropertyTypeQuery,
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling aggregatePropertyTypes",
            },
          ],
        };
      }

      return {
        data: response.data.getPropertyType,
      };
    },
    [aggregatePropertyTypesQuery],
  );

  return { aggregatePropertyTypes };
};
