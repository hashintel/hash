import { useEntityTypesContextRequired } from "./hooks/use-entity-types-context-required";

export const useEntityTypesLoading = () =>
  useEntityTypesContextRequired().entityTypes === null;

export const useLinkEntityTypes = () => {
  const { linkTypes } = useEntityTypesContextRequired();

  if (!linkTypes) {
    throw new Error("Link entity types not loaded yet");
  }

  return linkTypes;
};

export const useEntityTypesOptional = () =>
  useEntityTypesContextRequired().entityTypes;

export const useEntityTypes = () => {
  const entityTypes = useEntityTypesOptional();

  if (!entityTypes) {
    throw new Error("Entity types not loaded yet");
  }

  return entityTypes;
};

export const useFetchEntityTypes = () =>
  useEntityTypesContextRequired().refetch;
