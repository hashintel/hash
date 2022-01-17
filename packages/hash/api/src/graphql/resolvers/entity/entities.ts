import { ApolloError } from "apollo-server-express";

import { QueryEntitiesArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { exactlyOne } from "../../../util";

export const entities: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  QueryEntitiesArgs
> = async (_, params, { dataSources: { db } }) => {
  const { accountId } = params;

  let entityTypeFilter = undefined;
  if (params.filter?.entityType) {
    if (
      /** @todo check that these are uuids */
      exactlyOne(
        params.filter.entityType.componentId,
        params.filter.entityType.entityTypeId,
        params.filter.entityType.entityTypeVersionId,
        params.filter.entityType.systemTypeName,
      )
    ) {
      entityTypeFilter = {
        componentId: params.filter.entityType.componentId ?? undefined,
        entityTypeId: params.filter.entityType.entityTypeId ?? undefined,
        entityTypeVersionId:
          params.filter.entityType.entityTypeVersionId ?? undefined,
        systemTypeName: params.filter.entityType.systemTypeName ?? undefined,
      };
    } else {
      throw new ApolloError(
        `Given filter argument is invalid.`,
        "INVALID_ENTITY_TYPE_FILTER",
      );
    }
  }

  const resultingEntities = await Entity.getAccountEntities(db, {
    accountId,
    entityTypeFilter,
  });

  return resultingEntities.map((entity) => entity.toGQLUnknownEntity());
};
