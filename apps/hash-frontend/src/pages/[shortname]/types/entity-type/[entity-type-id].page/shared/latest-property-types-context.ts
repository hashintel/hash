import { PropertyType, VersionedUri } from "@blockprotocol/type-system";
import { Subgraph } from "@local/hash-types";
import { createContext, useContext } from "react";

export type LatestPropertyTypesContextValues = {
  types: Record<VersionedUri, PropertyType> | null;
  subgraph: Subgraph | null;
  refetch: () => Promise<void>;
};

export const LatestPropertyTypesContext =
  createContext<null | LatestPropertyTypesContextValues>(null);

export const useLatestPropertyTypes = () => {
  const context = useContext(LatestPropertyTypesContext);
  return [context?.types, context?.subgraph] as const;
};
export const useRefetchLatestPropertyTypes = () => {
  return useContext(LatestPropertyTypesContext)?.refetch;
};
