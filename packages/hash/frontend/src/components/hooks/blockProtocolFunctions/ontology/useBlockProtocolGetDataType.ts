import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetDataTypeQuery,
  GetDataTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getDataTypeQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { GetDataTypeMessageCallback } from "./ontology-types-shim";
import { Subgraph } from "../../../../lib/subgraph";

export const useBlockProtocolGetDataType = (): {
  getDataType: GetDataTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<GetDataTypeQuery, GetDataTypeQueryVariables>(
    getDataTypeQuery,
    {
      // Data types are immutable, any request for an dataTypeId should always return the same value.
      fetchPolicy: "cache-first",
    },
  );

  const getDataType = useCallback<GetDataTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getDataType",
            },
          ],
        };
      }

      const { dataTypeId } = data;

      const response = await getFn({
        variables: {
          dataTypeId,
          dataTypeResolveDepth: 255,
        },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getDataType",
            },
          ],
        };
      }

      return {
        /**
         * @todo: remove this when we start returning links in the subgraph
         *   https://app.asana.com/0/0/1203214689883095/f
         */
        data: response.data.getDataType as Subgraph,
      };
    },
    [getFn],
  );

  return { getDataType };
};
