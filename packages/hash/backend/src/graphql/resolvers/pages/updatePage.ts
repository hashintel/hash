import { ApolloError } from "apollo-server-express";

import { MutationUpdatePageArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";

export const updatePage: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  GraphQLContext,
  MutationUpdatePageArgs
> = async (_, { accountId, entityId, properties }, { dataSources }) => {
  return await dataSources.db.transaction(async (client) => {
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const entity = await Entity.getEntityLatestVersion(client)({
      accountId,
      entityId,
    });
    if (!entity) {
      throw new ApolloError(
        `page with fixed ID ${entity} not found`,
        "NOT_FOUND"
      );
    }

    await entity.updateEntityProperties(client)({
      ...(entity.properties ?? {}),
      ...properties,
    });

    // @todo: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    return entity.toGQLUnknownEntity();
  });
};
