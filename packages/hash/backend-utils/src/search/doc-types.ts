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
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  fullTextSearch?: string;
};
