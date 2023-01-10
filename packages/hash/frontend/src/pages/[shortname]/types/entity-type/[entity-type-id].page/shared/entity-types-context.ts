import { VersionedUri } from "@blockprotocol/type-system";
import { EntityTypeWithMetadata } from "@hashintel/hash-subgraph";
import { createContext, useContext } from "react";
// @todo deduplicate
export type EntityTypesSet = Record<VersionedUri, EntityTypeWithMetadata>;
export type EntityTypesContextValue = {
  entityTypes: EntityTypesSet | null;
  linkTypes: EntityTypesSet | null;
  refetch: () => Promise<void>;
};

export const EntityTypesContext = createContext<EntityTypesContextValue | null>(
  null,
);

const useEntityTypesContextRequired = () => {
  const context = useContext(EntityTypesContext);

  if (!context) {
    throw new Error("Context missing");
  }

  return context;
};

export const useEntityTypesLoading = () =>
  useEntityTypesContextRequired().entityTypes === null;

export const useLinkEntityTypes = () => {
  const { linkTypes } = useEntityTypesContextRequired();

  if (!linkTypes) {
    throw new Error("Link entity types not loaded yet");
  }

  return linkTypes;
};

export const useEntityTypes = () => {
  const { entityTypes } = useEntityTypesContextRequired();

  if (!entityTypes) {
    throw new Error("Entity types not loaded yet");
  }

  return entityTypes;
};

export const useFetchEntityTypes = () =>
  useEntityTypesContextRequired().refetch;
