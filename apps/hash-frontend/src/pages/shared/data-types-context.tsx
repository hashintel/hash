import { useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedValues } from "@local/advanced-types/typed-entries";
import type { DataTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo } from "react";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";

export type DataTypesContextValue = {
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata> | null;
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

  const value = useMemo(() => {
    return {
      dataTypes,
    };
  }, [dataTypes]);

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
