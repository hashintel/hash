import { createContext, useContext, useEffect } from "react";

import type {
  BaseUrl,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export type DataTypesContextValue = {
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata> | null;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata> | null;
  loading: boolean;
  error: Error | null;
  ensureFetched: () => void;
  /** Resolves once the refreshed types are loaded — await before re-reading */
  refetch: () => Promise<void>;
  onDataTypeSaved: (dataType: DataTypeWithMetadata) => void;
};

export const DataTypesContext = createContext<null | DataTypesContextValue>(
  null,
);

export const useDataTypesContext = () => {
  const dataTypesContext = useContext(DataTypesContext);

  if (!dataTypesContext) {
    throw new Error("no DataTypesContext value has been provided");
  }

  const { ensureFetched } = dataTypesContext;
  useEffect(() => {
    ensureFetched();
  }, [ensureFetched]);

  return dataTypesContext;
};
