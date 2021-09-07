import { ApolloError } from "apollo-server-express";

import { MutationUpdateEntityArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";

export const updateEntity: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  GraphQLContext,
  MutationUpdateEntityArgs
> = async (_, { accountId, metadataId, properties }, { dataSources }) => {
  return await dataSources.db.transaction(async (client) => {
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const entity = await Entity.getEntityLatestVersion(client)({
      accountId,
      entityId: metadataId,
    });
    if (!entity) {
      const msg = `entity ${metadataId} not found in account ${accountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    // Temporary hack - need to figure out how clients side property updates properly.
    // How do they update things on the root entity, e.g. type?
    const propertiesToUpdate = properties.properties ?? properties;
    entity.properties = propertiesToUpdate;

    await entity.updateProperties(client)(propertiesToUpdate);

    // TODO: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    return entity.toGQLUnknownEntity();
  });
};
