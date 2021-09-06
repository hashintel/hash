import * as db from "../db/adapter";
import {
  EntityTypeWithoutTypeFields,
  EntityWithIncompleteEntityType,
} from "../model/entityType.model";

/** Converts an `Entity` type returned by the `db` library, to an `UnknownEntity`
 * type defined by the GraphQL type definition.
 * @todo remove this once all resolvers go via model classes
 * */
export const dbEntityToGraphQLEntity = (
  entity: db.Entity
): EntityWithIncompleteEntityType => {
  return {
    accountId: entity.accountId,
    id: entity.entityVersionId,
    entityVersionId: entity.entityVersionId,
    entityId: entity.entityId,
    metadataId: entity.entityId,
    createdAt: entity.entityCreatedAt,
    entityVersionCreatedAt: entity.entityVersionCreatedAt,
    createdById: entity.createdById,
    updatedAt: entity.entityVersionUpdatedAt,
    visibility: entity.visibility,
    entityTypeId: entity.entityTypeId,
    entityTypeVersionId: entity.entityVersionId,
    entityTypeName: entity.entityTypeName,
    entityType: dbEntityTypeToGraphQLEntityType(entity.entityType),
    properties: entity.properties,
  };
};

/**
 * Converts an `EntityType` type returned by the `db` library to an `EntityType`
 * type defined by the GraphQL type definition, except WITHOUT its own type fields
 * as these are currently resolved by separate field resolvers.
 * @todo remove this once remaining uses of dbEntityToGraphQLEntity are removed
 *    in favour of resolvers going through the model classes
 */
export const dbEntityTypeToGraphQLEntityType = (
  type: db.EntityType
): EntityTypeWithoutTypeFields => {
  return {
    accountId: type.accountId,
    id: type.entityVersionId,
    entityId: type.entityId,
    metadataId: type.entityId,
    entityVersionId: type.entityVersionId,
    createdAt: type.entityCreatedAt,
    entityVersionCreatedAt: type.entityVersionCreatedAt,
    updatedAt: type.entityVersionUpdatedAt,
    createdById: type.createdById,
    visibility: type.visibility,
    properties: type.properties,
  };
};
