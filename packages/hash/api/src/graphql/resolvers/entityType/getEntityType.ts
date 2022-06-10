import { UserInputError } from "apollo-server-errors";
import { ApolloError } from "apollo-server-express";
import { exactlyOne, validateEntityTypeChoice } from "../../../util";

import { QueryGetEntityTypeArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntityType, EntityType } from "../../../model";

export const getEntityType: Resolver<
  Promise<UnresolvedGQLEntityType>,
  {},
  GraphQLContext,
  QueryGetEntityTypeArgs
> = async (_, { entityTypeId, choice }, { dataSources }) => {
  let filter;

  if (
    /** @todo check that these are uuids */
    exactlyOne(entityTypeId, choice)
  ) {
    filter = choice ? validateEntityTypeChoice(choice) : { entityTypeId };
  } else {
    throw new UserInputError(
      `Must provide at least one of entityTypeId or choice`,
    );
  }

  let entityType;

  if (filter.entityTypeId) {
    entityType = await EntityType.getEntityType(dataSources.db, {
      entityTypeId: filter.entityTypeId,
    });
  } else if (filter.entityTypeVersionId) {
    entityType = await EntityType.getEntityType(dataSources.db, {
      entityTypeVersionId: filter.entityTypeVersionId,
    });
  } else if (filter.systemTypeName) {
    entityType = await EntityType.getEntityTypeBySystemTypeName(
      dataSources.db,
      { systemTypeName: filter.systemTypeName },
    );
  } else if (filter.componentId) {
    entityType = await EntityType.getEntityTypeByComponentId(dataSources.db, {
      componentId: filter.componentId,
    });
  }

  if (!entityType) {
    throw new ApolloError(
      `EntityType with entityId ${entityTypeId} not found`,
      "NOT_FOUND",
    );
  }

  return entityType.toGQLEntityType();
};
