import { useQuery } from "@apollo/client";
import { JsonValue } from "@blockprotocol/core";
import { VersionedUrl } from "@blockprotocol/type-system";
import { typedValues } from "@local/advanced-types/typed-entries";
import {
  DataTypeWithMetadata,
  OntologyTypeRevisionId,
} from "@local/hash-subgraph";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/src/shared/type-system-patch";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from "react";

import {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";

export type DataTypesContextValue = {
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
  formatDataTypeValue: (args: {
    dataTypeId: VersionedUrl;
    value: JsonValue;
  }) => string | null;
};

export const DataTypesContext = createContext<null | DataTypesContextValue>(
  null,
);

export const DataTypesContextProvider = ({ children }: PropsWithChildren) => {
  const { data } = useQuery<QueryDataTypesQuery, QueryDataTypesQueryVariables>(
    queryDataTypesQuery,
    {
      fetchPolicy: "cache-first",
    },
  );

  const dataTypes = useMemo(() => {
    if (!data) {
      return {};
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
      if (!data) {
        return value?.toString() ?? null;
      }
      const { baseUrl, version } = componentsFromVersionedUrl(dataTypeId);

      const dataType = data.queryDataTypes.vertices[baseUrl]?.[
        version as unknown as OntologyTypeRevisionId
      ]?.inner.schema as DataTypeWithMetadata["schema"] | undefined;

      if (!dataType) {
        return value?.toString() ?? null;
      }

      const { left = "", right = "" } = dataType.label ?? {};

      return `${left}${value}${right}`;
    },
    [data],
  );

  const value = useMemo(() => {
    return {
      dataTypes,
      formatDataTypeValue,
    };
  }, [dataTypes, formatDataTypeValue]);

  <DataTypesContext.Provider value={value}>
    {children}
  </DataTypesContext.Provider>;
};

export const useDataTypesContext = () => {
  const dataTypesContext = useContext(DataTypesContext);

  if (!dataTypesContext) {
    throw new Error("no DataTypesContext value has been provided");
  }

  return dataTypesContext;
};
