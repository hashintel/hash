import { ApolloError } from "apollo-server-express";

import { DbUnknownEntity } from "../../../types/dbTypes";
import {
  MutationUpdateEntityArgs,
  Resolver,
  Visibility,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const updateEntity: Resolver<
  Promise<DbUnknownEntity>,
  {},
  GraphQLContext,
  MutationUpdateEntityArgs
> = async (_, { accountId, metadataId, properties }, { dataSources }) => {
  return await dataSources.db.transaction(async (client) => {
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const entity = await client.getLatestEntityVersion({
      accountId,
      metadataId,
    });
    if (!entity) {
      const msg = `entity ${metadataId} not found in account ${accountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    // Temporary hack - need to figure out how clients side property updates properly.
    // How do they update things on the root entity, e.g. type?
    const propertiesToUpdate = properties.properties ?? properties;
    entity.properties = propertiesToUpdate;

    const updatedEntities = await client.updateEntity({
      accountId,
      entityVersionId: entity.entityVersionId,
      metadataId: entity.metadataId,
      properties: propertiesToUpdate,
    });

    // TODO: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    return {
      ...updatedEntities[0],
      id: updatedEntities[0].entityVersionId,
      accountId: updatedEntities[0].accountId,
      visibility: Visibility.Public, // TODO: get from entity metadata
    };
  });
};
