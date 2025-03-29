import { useLazyQuery } from "@apollo/client";
import type { DataTypeRootType } from "@blockprotocol/graph";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  GetDataTypeQuery,
  GetDataTypeQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getDataTypeQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import type { GetDataTypeMessageCallback } from "./ontology-types-shim";

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
    async ({ data: dataTypeId }) => {
      if (!dataTypeId) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getDataType",
            },
          ],
        };
      }

      const response = await getFn({
        variables: {
          dataTypeId,
          constrainsValuesOn: { outgoing: 255 },
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

      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<DataTypeRootType>(
        response.data.getDataType,
      );

      return { data: subgraph };
    },
    [getFn],
  );

  return { getDataType };
};
