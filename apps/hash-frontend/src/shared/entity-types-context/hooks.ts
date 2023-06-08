import { useEntityTypesContextRequired } from "./hooks/use-entity-types-context-required";

export const useEntityTypesLoading = () =>
  useEntityTypesContextRequired().loading;

export const useEntityTypesOptional = () =>
  useEntityTypesContextRequired().entityTypes;

export const useEntityTypesSubgraphOptional = () =>
  useEntityTypesContextRequired().subgraph;

export const useFetchEntityTypes = () =>
  useEntityTypesContextRequired().refetch;
