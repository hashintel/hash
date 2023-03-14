import { PropertyType } from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { createContext, PropsWithChildren, useContext } from "react";

import { useLatestPropertyTypesContextValue } from "./use-latest-property-types-context-value";

export type LatestPropertyTypesContextValues = {
  propertyTypes: Record<VersionedUrl, PropertyType> | null;
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
