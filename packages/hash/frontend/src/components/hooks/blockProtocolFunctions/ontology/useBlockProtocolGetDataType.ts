import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetDataTypeQuery,
  GetDataTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getDataTypeQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { GetDataTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetDataType = (): {
  aggregateDataTypes: GetDataTypeMessageCallback;
} => {
  const [aggregateDataTypesQuery] = useLazyQuery<
    GetDataTypeQuery,
    GetDataTypeQueryVariables
  >(getDataTypeQuery);

  const aggregateDataTypes = useCallback<GetDataTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for aggregateDataTypes",
            },
          ],
        };
      }

      const response = await aggregateDataTypesQuery({
        query: getDataTypeQuery,
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling aggregateDataTypes",
            },
          ],
        };
      }

      return {
        data: response.data.getDataType,
      };
    },
    [aggregateDataTypesQuery],
  );

  return { aggregateDataTypes };
};
