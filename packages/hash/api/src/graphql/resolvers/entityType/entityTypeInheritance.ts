import { ApolloError } from "apollo-server-express";

import { Resolver, EntityType as GQLEntityType } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityType, UnresolvedGQLEntityType } from "../../../model";
import {
  generateSchema$id,
  schema$idRef,
} from "../../../model/entityType.util";

const immediateChildren: Resolver<
  Promise<UnresolvedGQLEntityType[]>,
  GQLEntityType,
  GraphQLContext
> = async (params, _, { dataSources: { db } }) => {
  const { accountId, entityId: entityTypeId } = params;
  const schema$ID = generateSchema$id(accountId, entityTypeId);
  const schemaRef = schema$idRef(schema$ID);

  const entityTypes = await EntityType.getImmediateChildren(db, { schemaRef });

  return entityTypes.map((entityType) => entityType.toGQLEntityType());
};

const immediateParents: Resolver<
  Promise<UnresolvedGQLEntityType[]>,
  GQLEntityType,
  GraphQLContext
> = async (params, _, { dataSources: { db } }) => {
  const { entityId: entityTypeId } = params;

  // The following entityType must exist for this resolver to be called
  const entityType = await EntityType.getEntityType(db, {
    entityTypeId,
  });

  if (!entityType) {
    throw new ApolloError(
      `EntityType with entityId ${entityTypeId} not found`,
      "NOT_FOUND",
    );
  }
  const entityTypeParents = await entityType.getImmediateParents(db);

  return entityTypeParents.map((ent) => ent.toGQLEntityType());
};

const allParents: Resolver<
  Promise<UnresolvedGQLEntityType[]>,
  GQLEntityType,
  GraphQLContext
> = async (params, _, { dataSources: { db } }) => {
  const { entityId: entityTypeId } = params;

  // The following entityType must exist for this resolver to be called
  const entityType = await EntityType.getEntityType(db, {
    entityTypeId,
  });

  if (!entityType) {
    throw new ApolloError(
      `EntityType with entityId ${entityTypeId} not found`,
      "NOT_FOUND",
    );
  }
  const entityTypeAllParents = await entityType.getAllParents(db);

  return entityTypeAllParents.map((ent) => ent.toGQLEntityType());
};

export const entityTypeInheritance = {
  immediateChildren,
  immediateParents,
  allParents,
};
