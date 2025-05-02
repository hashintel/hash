import { useQuery } from "@apollo/client";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { compareOntologyTypeVersions } from "@blockprotocol/type-system";
import { typedValues } from "@local/advanced-types/typed-entries";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo } from "react";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";

export type DataTypesContextValue = {
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata> | null;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata> | null;
  loading: boolean;
  refetch: () => void;
};

export const DataTypesContext = createContext<null | DataTypesContextValue>(
  null,
);

export const DataTypesContextProvider = ({ children }: PropsWithChildren) => {
  const { data, loading, refetch } = useQuery<
    QueryDataTypesQuery,
    QueryDataTypesQueryVariables
  >(queryDataTypesQuery, {
    fetchPolicy: "cache-first",
    variables: {
      constrainsValuesOn: { outgoing: 255 },
      inheritsFrom: { outgoing: 255 },
      latestOnly: false,
    },
  });

  const { dataTypes, latestDataTypes } = useMemo(() => {
    if (!data) {
      return {
        dataTypes: null,
        latestDataTypes: null,
      };
    }

    const all: Record<VersionedUrl, DataTypeWithMetadata> = {};
    const latest: Record<BaseUrl, DataTypeWithMetadata> = {};

    for (const versionToVertexMap of Object.values(
      data.queryDataTypes.vertices,
    )) {
      let highestVersion: DataTypeWithMetadata | null = null;

      for (const dataTypeVertex of typedValues(versionToVertexMap)) {
        if (dataTypeVertex.kind === "dataType") {
          if (
            !highestVersion ||
            compareOntologyTypeVersions(
              dataTypeVertex.inner.metadata.recordId.version,
              highestVersion.metadata.recordId.version,
            ) > 0
          ) {
            highestVersion = dataTypeVertex.inner;
          }
          all[dataTypeVertex.inner.schema.$id] = dataTypeVertex.inner;
        }
      }

      if (highestVersion) {
        latest[highestVersion.metadata.recordId.baseUrl] = highestVersion;
      }
    }

    return { dataTypes: all, latestDataTypes: latest };
  }, [data]);

  const value = useMemo(() => {
    return {
      dataTypes,
      latestDataTypes,
      loading,
      refetch,
    };
  }, [dataTypes, latestDataTypes, loading, refetch]);

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
