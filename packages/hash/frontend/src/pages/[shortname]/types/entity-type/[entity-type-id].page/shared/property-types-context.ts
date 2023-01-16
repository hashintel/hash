import { PropertyType, VersionedUri } from "@blockprotocol/type-system";
import { Subgraph } from "@hashintel/hash-subgraph";
import { createContext, useContext } from "react";

export type PropertyTypesContextValues = {
  types: Record<VersionedUri, PropertyType> | null;
  subgraph: Subgraph;
  refetch: () => Promise<void>;
};

export const PropertyTypesContext =
  createContext<null | PropertyTypesContextValues>(null);

export const usePropertyTypes = () => {
  const context = useContext(PropertyTypesContext);
  return [context?.types, context?.subgraph] as const;
};
export const useRefetchPropertyTypes = () => {
  return useContext(PropertyTypesContext)?.refetch;
};
