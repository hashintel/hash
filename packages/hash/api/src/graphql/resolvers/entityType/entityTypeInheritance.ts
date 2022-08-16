import { ApolloError } from "apollo-server-express";

import { ResolverFn, DeprecatedEntityType } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityType, UnresolvedGQLEntityType } from "../../../model";

const children: ResolverFn<
  Promise<UnresolvedGQLEntityType[]>,
  DeprecatedEntityType,
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

  const entityTypeChildren = await entityType.getChildren(db);

  return entityTypeChildren.map((child) => child.toGQLEntityType());
};

const parents: ResolverFn<
  Promise<UnresolvedGQLEntityType[]>,
  DeprecatedEntityType,
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

  const entityTypeParents = await entityType.getParents(db);

  return entityTypeParents.map((parent) => parent.toGQLEntityType());
};

const ancestors: ResolverFn<
  Promise<UnresolvedGQLEntityType[]>,
  DeprecatedEntityType,
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
  const entityTypeAllParents = await entityType.getAncestors(db);

  return entityTypeAllParents.map((ent) => ent.toGQLEntityType());
};

export const entityTypeInheritance = {
  children,
  parents,
  ancestors,
};
