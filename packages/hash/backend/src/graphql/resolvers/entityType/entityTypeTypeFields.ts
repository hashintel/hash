import { Resolver, EntityType as GQLEntityType } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityType, EntityTypeWithoutTypeFields } from "../../../model";
import { ApolloError } from "apollo-server-express";
import { EntityTypeTypeFields } from "../../../db/adapter";

type EntityTypeMaybeTypeFields = EntityTypeWithoutTypeFields & {
  entityType?: GQLEntityType["entityType"];
  entityTypeId?: GQLEntityType["entityTypeId"];
  entityTypeVersionId?: GQLEntityType["entityTypeVersionId"];
  entityTypeName?: GQLEntityType["entityTypeName"];
};

/**
 * @todo cache this for an extremely long time
 */
const getEntityTypeType = async (dataSources: GraphQLContext["dataSources"]) =>
  EntityType.getEntityTypeType(dataSources.db).catch((err) => {
    throw new ApolloError(err.message);
  });

/**
 * Get the entityType of an EntityType, i.e. the "EntityType" EntityType
 */
const entityType: Resolver<
  Omit<GQLEntityType["entityType"], EntityTypeTypeFields>,
  EntityTypeMaybeTypeFields,
  GraphQLContext
> = async (entityType, __, { dataSources }) => {
  if (entityType.entityType) {
    return entityType.entityType;
  }
  return getEntityTypeType(dataSources).then((type) => type.toGQLEntityType());
};

/**
 * Get the entityTypeId of an EntityType, i.e. the entityId of the "EntityType" EntityType.
 */
const entityTypeId: Resolver<
  GQLEntityType["entityTypeId"],
  EntityTypeMaybeTypeFields,
  GraphQLContext
> = async (entityType, __, { dataSources }) => {
  if (entityType.entityType) {
    return entityType.entityType.entityId;
  }
  if (entityType.entityTypeId) {
    return entityType.entityTypeId;
  }
  return getEntityTypeType(dataSources).then((type) => type.entityId);
};

/**
 * Get the entityTypeName of an EntityType, i.e. the name of the "EntityType" EntityType.
 */
const entityTypeName: Resolver<
  GQLEntityType["entityTypeName"],
  EntityTypeMaybeTypeFields,
  GraphQLContext
> = async (entityType, __, { dataSources }): Promise<string> => {
  if (entityType.entityType) {
    return entityType.entityType.properties.title;
  }
  if (entityType.entityTypeName) {
    return entityType.entityTypeName;
  }
  return getEntityTypeType(dataSources).then(
    (type) => type.properties.title as string
  );
};

/**
 * Get the entityTypeVersionId of an EntityType, i.e. the entityVersionId of the "EntityType" EntityType.
 */
const entityTypeVersionId: Resolver<
  GQLEntityType["entityTypeVersionId"],
  EntityTypeMaybeTypeFields,
  GraphQLContext
> = async (entityType, __, { dataSources }) => {
  if (entityType.entityType) {
    return entityType.entityType.entityVersionId;
  }
  if (entityType.entityTypeVersionId) {
    return entityType.entityTypeVersionId;
  }
  return getEntityTypeType(dataSources).then((type) => type.entityVersionId);
};

export const entityTypeTypeFields = {
  entityType,
  entityTypeId,
  entityTypeName,
  entityTypeVersionId,
};
