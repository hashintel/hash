import { ApolloError } from "apollo-server-express";

import {
  MutationUpdatePageArgs,
  Resolver,
  UnknownEntity,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { dbEntityToGraphQLEntity } from "../../util";

export const updatePage: Resolver<
  Promise<UnknownEntity>,
  {},
  GraphQLContext,
  MutationUpdatePageArgs
> = async (_, { accountId, metadataId, properties }, { dataSources }) => {
  return await dataSources.db.transaction(async (client) => {
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const entity = await client.getEntityLatestVersion({
      accountId,
      entityId: metadataId,
    });
    if (!entity) {
      throw new ApolloError(`page ${metadataId} not found`, "NOT_FOUND");
    }

    const updatedEntities = (
      await client.updateEntity({
        accountId,
        entityVersionId: entity.entityVersionId,
        entityId: entity.entityId,
        properties: {
          ...(entity.properties ?? {}),
          ...properties,
        },
      })
    ).map(dbEntityToGraphQLEntity);

    // @todo: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    return updatedEntities[0];
  });
};
