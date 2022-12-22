import { VersionedUri } from "@blockprotocol/type-system";
import { EntityTypeWithMetadata } from "@hashintel/hash-subgraph";
import { createContext, useContext } from "react";
// @todo deduplicate
export type EntityTypesSet = Record<VersionedUri, EntityTypeWithMetadata>;
export type EntityTypesContextValue = {
  entityTypes: EntityTypesSet;
  linkTypes: EntityTypesSet;
  refetch: () => Promise<void>;
};
export const EntityTypesContext = createContext<EntityTypesContextValue | null>(
  null,
);

export const useEntityTypesLoading = () =>
  useContext(EntityTypesContext) === null;

const useEntityTypesContext = () => {
  const context = useContext(EntityTypesContext);

  if (!context) {
    throw new Error("Entity types not loaded yet");
  }
  return context;
};

export const useLinkEntityTypes = () => useEntityTypesContext().linkTypes;
export const useEntityTypes = () => useEntityTypesContext().entityTypes;
export const useFetchEntityTypes = () => useEntityTypesContext().refetch;
