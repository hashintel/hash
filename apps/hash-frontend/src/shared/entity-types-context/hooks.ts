import { useEntityTypesContextRequired } from "./hooks/use-entity-types-context-required";

export const useEntityTypesOptional = () =>
  useEntityTypesContextRequired().entityTypes;

export const useFetchEntityTypes = () =>
  useEntityTypesContextRequired().refetch;

export const useEntityTypesLoading = () =>
  useEntityTypesContextRequired().loading;

export const useEntityTypesSubgraphOptional = () =>
  useEntityTypesContextRequired().subgraph;
