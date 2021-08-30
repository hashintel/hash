import * as db from "../db/adapter";
import * as gql from "./apiTypes.gen";

/** Converts an `Entity` type returned by the `db` library, to an `UnknownEntity`
 * type defined by the GraphQL type definition. */
export const dbEntityToGraphQLEntity = (
  entity: db.Entity
): gql.UnknownEntity => {
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

/** Converts an `EntityType` type returned by the `db` library to an `EntityType`
 * type defined by the GraphQL type definition. */
export const dbEntityTypeToGraphQLEntityType = (
  type: db.EntityType
): gql.EntityType => {
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
    entityTypeName: "", // @todo: what should this be?
    entityType: {} as gql.EntityType, // @todo: what should this be?
    entityTypeId: "", // @todo: what should this be?
    entityTypeVersionId: "", // @todo: what should this be?
  };
};

export const dbEntityToGraphQLOrg = (entity: db.Entity): gql.Org => {
  return {
    ...dbEntityToGraphQLEntity(entity),
    __typename: "Org",
  };
};
