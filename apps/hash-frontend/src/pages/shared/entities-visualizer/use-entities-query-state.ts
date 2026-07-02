import { useMemo, useState } from "react";

import { isBaseUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";

import { serializeFilterStateToQuery } from "./shared/filter-state-url";
import { useUrlSyncedFilterState } from "./shared/use-url-synced-filter-state";

import type { ColumnSort } from "../../../components/grid/utils/sorting";
import type { VisualizerView } from "../visualizer-views";
import type { SortableEntitiesTableColumnKey } from "./entities-table-data";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type {
  EntityQuerySortingPath,
  EntityQuerySortingRecord,
  EntityQuerySortingToken,
  NullOrdering,
  Ordering,
} from "@local/hash-graph-client";
import type { ConversionRequest } from "@local/hash-graph-sdk/entity";

export type EntitiesTableSort = ColumnSort<SortableEntitiesTableColumnKey> & {
  /** Sort on the property's value converted to this data type (e.g. sort heights in metres). */
  convertTo?: BaseUrl;
};

/** Per-column unit conversions, e.g. display a "Height" column in metres. */
export type ActiveConversions = {
  [columnBaseUrl: BaseUrl]: VersionedUrl;
};

const generateGraphSort = (
  columnKey: SortableEntitiesTableColumnKey,
  direction: "asc" | "desc",
  convertTo?: BaseUrl,
): EntityQuerySortingRecord => {
  const nulls: NullOrdering = direction === "asc" ? "last" : "first";
  const ordering: Ordering = direction === "asc" ? "ascending" : "descending";

  let path: EntityQuerySortingPath;

  switch (columnKey) {
    case "entityLabel":
      path = ["label" satisfies EntityQuerySortingToken];
      break;
    case "lastEdited":
      path = [
        "editionCreatedAtTransactionTime" satisfies EntityQuerySortingToken,
      ];
      break;
    case "created":
      path = ["createdAtTransactionTime" satisfies EntityQuerySortingToken];
      break;
    case "entityTypes":
      path = ["typeTitle" satisfies EntityQuerySortingToken];
      break;
    case "archived":
      path = ["archived" satisfies EntityQuerySortingToken];
      break;
    default: {
      if (!isBaseUrl(columnKey)) {
        throw new Error(`Unexpected sorting column key: ${columnKey}`);
      }
      path = ["properties" satisfies EntityQuerySortingToken, columnKey];

      if (convertTo) {
        path.push("convert", convertTo);
      }
    }
  }

  return {
    path,
    nulls,
    ordering,
  };
};

/**
 * Owns every user-controlled input that shapes the entities query: filter
 * state (optionally persisted to the URL), sort, per-column unit conversions,
 * and the selected view. All setters returned by this hook are plain state
 * setters with stable identities.
 *
 * Pagination is NOT owned here: cursors are continuations of responses, so
 * they live with the fetched pages in {@link useEntitiesVisualizerData},
 * which restarts from page one whenever these inputs change.
 */
export const useEntitiesQueryState = ({
  entityTypeBaseUrl,
  entityTypeId,
  internalWebs,
  isTypePinned,
  persistFilterStateInUrl,
}: {
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
  internalWebs: { webId: WebId }[];
  isTypePinned: boolean;
  persistFilterStateInUrl: boolean;
}) => {
  const [filterState, setFilterState] = useUrlSyncedFilterState({
    enabled: persistFilterStateInUrl,
    internalWebs,
    isTypePinned,
  });

  const [sort, setSort] = useState<EntitiesTableSort>({
    columnKey: "entityLabel",
    direction: "asc",
  });

  const [activeConversions, setActiveConversions] =
    useState<ActiveConversions | null>(null);

  /**
   * The view the user explicitly picked, or `null` if they haven't -- in which
   * case the displayed view is derived from the data (see useVisualizerView).
   */
  const [selectedView, setSelectedView] = useState<VisualizerView | null>(null);

  /**
   * The view as far as the server query is concerned. Table and Grid issue
   * identical queries, and the data-derived default is never Graph, so only
   * an explicit Graph selection changes the request.
   */
  const queryView: VisualizerView = selectedView ?? "Table";

  const graphSort = useMemo(
    () => generateGraphSort(sort.columnKey, sort.direction, sort.convertTo),
    [sort],
  );

  const conversionRequests = useMemo<ConversionRequest[] | undefined>(
    () =>
      activeConversions
        ? typedEntries(activeConversions).map(
            ([columnBaseUrl, dataTypeId]) => ({
              path: [columnBaseUrl],
              dataTypeId,
            }),
          )
        : undefined,
    [activeConversions],
  );

  /**
   * Identity of the displayed entity SET: the type scoping plus the canonical
   * (URL-grade) filter serialization. Pagination and sort/conversions don't
   * change which entities are shown (only how many so far / in what order),
   * so they're excluded. A change here means the entity set was REPLACED, not
   * extended -- the graph visualizer uses it to purge and re-ingest rather
   * than append stale data, and the root uses it to drop row selections that
   * referred to the previous set.
   */
  const entitySetKey = useMemo(
    () =>
      JSON.stringify({
        entityTypeBaseUrl,
        entityTypeId,
        filter: serializeFilterStateToQuery({
          filterState,
          internalWebIds: internalWebs.map(({ webId }) => webId),
          isTypePinned,
        }),
      }),
    [entityTypeBaseUrl, entityTypeId, filterState, internalWebs, isTypePinned],
  );

  return {
    activeConversions,
    conversionRequests,
    entitySetKey,
    filterState,
    graphSort,
    queryView,
    selectedView,
    setActiveConversions,
    setFilterState,
    setSelectedView,
    setSort,
    sort,
  };
};
