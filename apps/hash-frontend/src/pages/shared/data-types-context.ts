import { createContext, useContext } from "react";

import type {
  BaseUrl,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export type DataTypesContextValue = {
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata> | null;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata> | null;
  loading: boolean;
  refetch: () => void;
};

export const DataTypesContext = createContext<null | DataTypesContextValue>(
  null,
);

export const useDataTypesContext = () => {
  const dataTypesContext = useContext(DataTypesContext);

  if (!dataTypesContext) {
    throw new Error("no DataTypesContext value has been provided");
  }

  return dataTypesContext;
};
