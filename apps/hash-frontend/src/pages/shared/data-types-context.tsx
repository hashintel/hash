import { useQuery } from "@apollo/client";
import type { JsonValue } from "@blockprotocol/core";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedValues } from "@local/advanced-types/typed-entries";
import type { FormattedValuePart } from "@local/hash-isomorphic-utils/data-types";
import { formatDataValue } from "@local/hash-isomorphic-utils/data-types";
import type {
  DataTypeWithMetadata,
  OntologyTypeRevisionId,
} from "@local/hash-subgraph";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";

export type DataTypesContextValue = {
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata> | null;
  formatDataTypeValue: (args: {
    dataTypeId: VersionedUrl;
    value: JsonValue;
  }) => FormattedValuePart[] | null;
};

export const DataTypesContext = createContext<null | DataTypesContextValue>(
  null,
);

export const DataTypesContextProvider = ({ children }: PropsWithChildren) => {
  const { data } = useQuery<QueryDataTypesQuery, QueryDataTypesQueryVariables>(
    queryDataTypesQuery,
    {
      fetchPolicy: "cache-first",
      variables: {
        constrainsValuesOn: { outgoing: 255 },
      },
    },
  );

  const dataTypes = useMemo(() => {
    if (!data) {
      return null;
    }
    const allDataTypes: Record<VersionedUrl, DataTypeWithMetadata> = {};

    for (const vertex of Object.values(data.queryDataTypes.vertices)) {
      const latestVersion = typedValues(vertex)[0];
      if (latestVersion?.kind === "dataType") {
        allDataTypes[latestVersion.inner.schema.$id] = latestVersion.inner;
      }
    }

    return allDataTypes;
  }, [data]);

  const formatDataTypeValue = useCallback(
    ({ dataTypeId, value }: { dataTypeId: VersionedUrl; value: JsonValue }) => {
      const { baseUrl, version } = componentsFromVersionedUrl(dataTypeId);

      const dataType = data?.queryDataTypes.vertices[baseUrl]?.[
        version as unknown as OntologyTypeRevisionId
      ]?.inner.schema as DataTypeWithMetadata["schema"] | undefined;

      if (!dataType) {
        return formatDataValue(value?.toString() ?? "null", null);
      }

      return formatDataValue(value, dataType);
    },
    [data],
  );

  const value = useMemo(() => {
    return {
      dataTypes,
      formatDataTypeValue,
    };
  }, [dataTypes, formatDataTypeValue]);

  return (
    <DataTypesContext.Provider value={value}>
      {children}
    </DataTypesContext.Provider>
  );
};

export const useDataTypesContext = () => {
  const dataTypesContext = useContext(DataTypesContext);

  if (!dataTypesContext) {
    throw new Error("no DataTypesContext value has been provided");
  }

  return dataTypesContext;
};
