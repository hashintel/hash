import type { ApolloQueryResult } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
} from "@local/hash-graph-client";
import type {
  ConversionRequest,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { useMemo } from "react";

import type { GetEntitySubgraphQuery } from "../../../graphql/api-types.gen";
import { useEntityTypeEntities } from "../../../shared/use-entity-type-entities";
import type { VisualizerView } from "../visualizer-views";
import type {
  EntitiesTableData,
  EntitiesTableRow,
  UpdateTableDataFn,
} from "./types";
import { useEntitiesTableData } from "./use-entities-table-data";

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
  tableData: EntitiesTableData | null;
  updateTableData: UpdateTableDataFn;
};

export const useEntitiesVisualizerData = (params: {
  conversions?: ConversionRequest[];
  cursor?: EntityQueryCursor;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
  hideColumns?: (keyof EntitiesTableRow)[];
  includeArchived: boolean;
  limit?: number;
  webIds?: WebId[];
  sort?: EntityQuerySortingRecord;
  view: VisualizerView;
}): EntitiesVisualizerData => {
  const {
    conversions,
    cursor,
    entityTypeBaseUrl,
    entityTypeIds,
    includeArchived,
    limit,
    hideColumns,
    webIds: webIdsParam,
    sort,
    view,
  } = params;

  const { tableData, updateTableData } = useEntitiesTableData({
    hideColumns,
    hideArchivedColumn: !includeArchived,
  });

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
  } = useEntityTypeEntities(
    {
      conversions,
      cursor,
      entityTypeBaseUrl,
      entityTypeIds,
      includeArchived,
      limit,
      webIds: webIdsParam,
      graphResolveDepths:
        view === "Graph"
          ? {
              /**
               * The graph view gets all entities in the selected web anyway, so it will have all the links regardless.
               * We skip asking the graph to resolve them.
               * This does mean that links to entities outside the users' webs are not reflected in the graph view,
               * unless they have clicked to include entities from other webs.
               */
              hasLeftEntity: { outgoing: 0, incoming: 0 },
              hasRightEntity: { outgoing: 0, incoming: 0 },
            }
          : /**
             * The table view only needs outgoing: 1 for each, in order to be able to display the source and target of links.
             */ {
              hasLeftEntity: { outgoing: 1, incoming: 0 },
              hasRightEntity: { outgoing: 1, incoming: 0 },
            },
      sort,
    },
    (data) => {
      if (view === "Graph") {
        return;
      }

      const newSubgraph = mapGqlSubgraphFieldsFragmentToSubgraph<
        EntityRootType<HashEntity>
      >(data.getEntitySubgraph.subgraph);

      const newEntities = getRoots(newSubgraph);

      updateTableData({
        appliedPaginationCursor: cursor ?? null,
        closedMultiEntityTypesRootMap:
          data.getEntitySubgraph.closedMultiEntityTypes ?? {},
        definitions: data.getEntitySubgraph.definitions,
        entities: newEntities,
        subgraph: newSubgraph,
      });
    },
  );

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
      tableData,
      updateTableData,
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
      tableData,
      typeIds,
      typeTitles,
      updateTableData,
      webIds,
    ],
  );
};
