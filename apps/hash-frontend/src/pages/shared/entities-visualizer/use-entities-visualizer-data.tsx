import type { ApolloQueryResult } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
} from "@local/hash-graph-client";
import type {
  ConversionRequest,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import { useMemo } from "react";

import type { GetEntitySubgraphQuery } from "../../../graphql/api-types.gen";
import { useEntityTypeEntities } from "../../../shared/use-entity-type-entities";

export type EntitiesVisualizerData = Partial<
  Pick<
    GetEntitySubgraphQuery["getEntitySubgraph"],
    | "closedMultiEntityTypes"
    | "count"
    | "createdByIds"
    | "definitions"
    | "editionCreatedByIds"
    | "cursor"
    | "typeIds"
    | "typeTitles"
    | "webIds"
  >
> & {
  entities?: HashEntity[];
  // Whether or not cached content was available immediately for the context data
  hadCachedContent: boolean;
  /**
   * Whether or not a network request is in process.
   * Note that if is hasCachedContent is true, data for the given query is available before loading is complete.
   * The cached content will be replaced automatically and the value updated when the network request completes.
   */
  loading: boolean;
  refetch: () => Promise<ApolloQueryResult<GetEntitySubgraphQuery>>;
  subgraph?: Subgraph<EntityRootType<HashEntity>>;
};

export const useEntitiesVisualizerData = (params: {
  conversions?: ConversionRequest[];
  cursor?: EntityQueryCursor;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
  includeArchived: boolean;
  limit?: number;
  webIds?: WebId[];
  sort?: EntityQuerySortingRecord;
}): EntitiesVisualizerData => {
  const {
    conversions,
    cursor,
    entityTypeBaseUrl,
    entityTypeIds,
    includeArchived,
    limit,
    webIds: webIdsParam,
    sort,
  } = params;

  const {
    closedMultiEntityTypes,
    count,
    createdByIds,
    cursor: nextCursor,
    definitions,
    editionCreatedByIds,
    entities,
    hadCachedContent,
    loading,
    refetch,
    subgraph,
    typeIds,
    typeTitles,
    webIds,
  } = useEntityTypeEntities({
    conversions,
    cursor,
    entityTypeBaseUrl,
    entityTypeIds,
    includeArchived,
    limit,
    webIds: webIdsParam,
    graphResolveDepths: {
      hasLeftEntity: { outgoing: 1, incoming: 1 },
      hasRightEntity: { outgoing: 1, incoming: 1 },
    },
    sort,
  });

  return useMemo(
    () => ({
      closedMultiEntityTypes,
      count,
      createdByIds,
      cursor: nextCursor,
      definitions,
      editionCreatedByIds,
      entities,
      hadCachedContent,
      loading,
      refetch,
      subgraph,
      typeIds,
      typeTitles,
      webIds,
    }),
    [
      closedMultiEntityTypes,
      count,
      createdByIds,
      nextCursor,
      definitions,
      editionCreatedByIds,
      entities,
      hadCachedContent,
      loading,
      refetch,
      subgraph,
      typeIds,
      typeTitles,
      webIds,
    ],
  );
};
