import type { VersionedUrl, WebId } from "@blockprotocol/type-system";

export type EntitiesFilterState = {
  web: {
    selectedInternalWebIds: Set<WebId>;
    includeOtherWebs: boolean;
  };
  type: {
    selectedTypeIds: Set<VersionedUrl> | null;
  };
  includeArchived: boolean;
  /**
   * Server-side semantic search, modelled as a filter. `added` tracks whether
   * the search pill is present (it can be added with an empty query, which is a
   * no-op browse); `query` holds the debounced free-text query that is embedded
   * server-side and turned into a `cosineDistance` clause.
   */
  semanticSearch: {
    added: boolean;
    query: string;
  };
};

export const createDefaultFilterState = (
  internalWebIds: WebId[],
): EntitiesFilterState => ({
  web: {
    selectedInternalWebIds: new Set<WebId>(internalWebIds),
    includeOtherWebs: false,
  },
  type: { selectedTypeIds: null },
  includeArchived: false,
  semanticSearch: { added: false, query: "" },
});

/**
 * Whether a semantic search is currently driving the query — i.e. the pill is
 * present and holds a non-empty query. When false the `cosineDistance` clause is
 * omitted and the table behaves as a normal (cursor-paginated, column-sorted)
 * browse.
 */
export const hasActiveSemanticQuery = (
  filterState: EntitiesFilterState,
): boolean =>
  filterState.semanticSearch.added &&
  filterState.semanticSearch.query.trim().length > 0;
