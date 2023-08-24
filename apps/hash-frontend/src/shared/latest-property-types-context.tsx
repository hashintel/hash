import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { PropertyTypeWithMetadata } from "@local/hash-subgraph";
import { createContext, PropsWithChildren, useContext } from "react";

import { useLatestPropertyTypesContextValue } from "./latest-property-types-context/use-latest-property-types-context-value";

export type LatestPropertyTypesContextValues = {
  propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata> | null;
  refetch: () => Promise<void>;
};

export const LatestPropertyTypesContext =
  createContext<null | LatestPropertyTypesContextValues>(null);

export const useLatestPropertyTypes = () => {
  return useContext(LatestPropertyTypesContext)?.propertyTypes;
};

export const usePropertyTypesContextRequired = () => {
  const context = useContext(LatestPropertyTypesContext);

  if (!context) {
    throw new Error("Context missing");
  }

  return context;
};

export const useFetchLatestPropertyTypes = () => {
  return usePropertyTypesContextRequired().refetch;
};

export const LatestPropertyTypesContextProvider = ({
  children,
}: PropsWithChildren) => {
  const value = useLatestPropertyTypesContextValue();

  return (
    <LatestPropertyTypesContext.Provider value={value}>
      {children}
    </LatestPropertyTypesContext.Provider>
  );
};
