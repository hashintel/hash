import { SearchHit } from "@hashintel/hash-backend-utils/search/adapter";
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
  fullTextSearch?: string;
  belongsToPage?: SearchHit["belongsToPage"];
};
