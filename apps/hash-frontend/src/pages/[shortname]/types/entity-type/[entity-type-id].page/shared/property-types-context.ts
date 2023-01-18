import { PropertyType, VersionedUri } from "@blockprotocol/type-system";
import { createContext, useContext } from "react";

export type PropertyTypesContextValues = {
  types: Record<VersionedUri, PropertyType> | null;
  refetch: () => Promise<void>;
};

export const PropertyTypesContext =
  createContext<null | PropertyTypesContextValues>(null);

export const usePropertyTypes = () => {
  return useContext(PropertyTypesContext)?.types;
};
export const useRefetchPropertyTypes = () => {
  return useContext(PropertyTypesContext)?.refetch;
};
