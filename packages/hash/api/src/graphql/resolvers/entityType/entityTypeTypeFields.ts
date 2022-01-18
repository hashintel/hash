import { ApolloError } from "apollo-server-express";
import { Resolver, EntityType as GQLEntityType } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityType, UnresolvedGQLEntityType } from "../../../model";
import { EntityTypeTypeFields } from "../../../db/adapter";
import {
  generateSchema$id,
  schema$idRef,
} from "../../../lib/schemas/jsonSchema";

type EntityTypeMaybeTypeFields = UnresolvedGQLEntityType & {
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

const getEntityTypeById = async (
  dataSources: GraphQLContext["dataSources"],
  entityTypeId: string,
) =>
  EntityType.getEntityType(dataSources.db, { entityTypeId })
    .then((type) => {
      if (!type) {
        throw new ApolloError(
          `Could not find EntityType with entityTypeId ${entityTypeId}`,
        );
      }
      return type.toGQLEntityType();
    })
    .catch((err) => {
      throw new ApolloError(err.message);
    });

/**
 * Get the entityType of an EntityType, i.e. the "EntityType" EntityType
 */
const entityTypeResolver: Resolver<
  Omit<
    GQLEntityType["entityType"],
    | EntityTypeTypeFields
    | "linkGroups"
    | "linkedEntities"
    | "linkedAggregations"
  >,
  EntityTypeMaybeTypeFields,
  GraphQLContext
> = async (gqlEntityType, __, { dataSources }) => {
  if (gqlEntityType.entityType) {
    return gqlEntityType.entityType;
  }
  return getEntityTypeById(dataSources, gqlEntityType.entityId);
};

/**
 * Get the entityTypeId of an EntityType, i.e. the entityId of the "EntityType" EntityType.
 */
const entityTypeIdResolver: Resolver<
  GQLEntityType["entityTypeId"],
  EntityTypeMaybeTypeFields,
  GraphQLContext
> = async (gqlEntityType, __, _) => {
  if (gqlEntityType.entityType) {
    return gqlEntityType.entityType.entityId;
  }
  if (gqlEntityType.entityTypeId) {
    return gqlEntityType.entityTypeId;
  }
  return gqlEntityType.entityId;
};

/**
 * Get the entityTypeName of an EntityType, i.e. the name of the "EntityType" EntityType.
 */
const entityTypeNameResolver: Resolver<
  GQLEntityType["entityTypeName"],
  EntityTypeMaybeTypeFields,
  GraphQLContext
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
const entityTypeVersionIdResolver: Resolver<
  GQLEntityType["entityTypeVersionId"],
  EntityTypeMaybeTypeFields,
  GraphQLContext
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
  entityType: entityTypeResolver,
  entityTypeId: entityTypeIdResolver,
  entityTypeName: entityTypeNameResolver,
  entityTypeVersionId: entityTypeVersionIdResolver,
};

const entityTypeChildrenResolver: Resolver<
  Promise<UnresolvedGQLEntityType[]>,
  GQLEntityType,
  GraphQLContext
> = async (params, _, { dataSources: { db } }) => {
  const { accountId, entityId: entityTypeId } = params;
  const schema$ID = generateSchema$id(accountId, entityTypeId);
  const schemaRef = schema$idRef(schema$ID);

  const entityTypes = await EntityType.getEntityTypeChildren(db, { schemaRef });

  return entityTypes.map((entityType) => entityType.toGQLEntityType());
};

const entityTypeParentsResolver: Resolver<
  Promise<UnresolvedGQLEntityType[]>,
  EntityTypeMaybeTypeFields,
  GraphQLContext
> = async (params, _, { dataSources }) => {
  const { entityId: entityTypeId } = params;

  const entityTypes = await EntityType.getEntityTypeParents(dataSources.db, {
    entityTypeId,
  });

  return entityTypes.map((ent) => ent.toGQLEntityType());
};

export const entityTypeInheritance = {
  entityTypeChildren: entityTypeChildrenResolver,
  entityTypeParents: entityTypeParentsResolver,
};
