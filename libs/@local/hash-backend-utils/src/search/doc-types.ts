// The name of the search index containing entities and the document field to perform
// the search on. See the README for the `search-loader` for more details.
export const ENTITIES_SEARCH_INDEX = "entities";
export const ENTITIES_SEARCH_FIELD = "fullTextSearch";

/**
 * `EntitiesDocument` represents the type of document stored in the "entities" index
 * in the search service.
 */
export type EntitiesDocument = {
  accountId: string;
  entityId: string;
  entityVersionId: string;
  entityTypeId: string;
  entityTypeVersionId: string;
  entityTypeName: string;
  updatedAt: string;
  updatedByAccountId: string;
  [ENTITIES_SEARCH_FIELD]?: string;
  belongsToPage?: {
    entityId: string;
    entityVersionId: string;
    accountId: string;
  };
};
