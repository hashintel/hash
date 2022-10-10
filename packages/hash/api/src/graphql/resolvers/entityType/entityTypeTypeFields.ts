import { ApolloError } from "apollo-server-express";
import { ResolverFn, DeprecatedEntityType } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityType, UnresolvedGQLEntityType } from "../../../model";
import { EntityTypeTypeFields } from "../../../db/adapter";

type EntityTypeMaybeTypeFields = UnresolvedGQLEntityType & {
  entityType?: DeprecatedEntityType["entityType"];
  entityTypeId?: DeprecatedEntityType["entityTypeId"];
  entityTypeVersionId?: DeprecatedEntityType["entityTypeVersionId"];
  entityTypeName?: DeprecatedEntityType["entityTypeName"];
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
const entityType: ResolverFn<
  Omit<
    DeprecatedEntityType["entityType"],
    | EntityTypeTypeFields
    | "linkGroups"
    | "linkedEntities"
    | "linkedAggregations"
  >,
  EntityTypeMaybeTypeFields,
  GraphQLContext,
  {}
> = async (gqlEntityType, __, { dataSources }) => {
  if (gqlEntityType.entityType) {
    return gqlEntityType.entityType;
  }
  return getEntityTypeType(dataSources).then((type) => type.toGQLEntityType());
};

/**
 * Get the entityTypeId of an EntityType, i.e. the entityId of the "EntityType" EntityType.
 */
const entityTypeId: ResolverFn<
  DeprecatedEntityType["entityTypeId"],
  EntityTypeMaybeTypeFields,
  GraphQLContext,
  {}
> = async (gqlEntityType, __, { dataSources }) => {
  if (gqlEntityType.entityType) {
    return gqlEntityType.entityType.entityId;
  }
  if (gqlEntityType.entityTypeId) {
    return gqlEntityType.entityTypeId;
  }
  return getEntityTypeType(dataSources).then((type) => type.entityId);
};

/**
 * Get the entityTypeName of an EntityType, i.e. the name of the "EntityType" EntityType.
 */
const entityTypeName: ResolverFn<
  DeprecatedEntityType["entityTypeName"],
  EntityTypeMaybeTypeFields,
  GraphQLContext,
  {}
> = async (gqlEntityType, __, { dataSources }): Promise<string> => {
  if (gqlEntityType.entityType) {
    return gqlEntityType.entityType.properties.title;
  }
  if (gqlEntityType.entityTypeName) {
    return gqlEntityType.entityTypeName;
  }
  return getEntityTypeType(dataSources).then(
    (type) => type.properties.title as string,
  );
};

/**
 * Get the entityTypeVersionId of an EntityType, i.e. the entityVersionId of the "EntityType" EntityType.
 */
const entityTypeVersionId: ResolverFn<
  DeprecatedEntityType["entityTypeVersionId"],
  EntityTypeMaybeTypeFields,
  GraphQLContext,
  {}
> = async (gqlEntityType, __, { dataSources }) => {
  if (gqlEntityType.entityType) {
    return gqlEntityType.entityType.entityVersionId;
  }
  if (gqlEntityType.entityTypeVersionId) {
    return gqlEntityType.entityTypeVersionId;
  }
  return getEntityTypeType(dataSources).then((type) => type.entityVersionId);
};

export const entityTypeTypeFields = {
  entityType,
  entityTypeId,
  entityTypeName,
  entityTypeVersionId,
};
