import { ApolloError } from "apollo-server-express";
import { DbPage } from "../../../types/dbTypes";
import {
  MutationUpdatePageArgs,
  Resolver,
  Visibility,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const updatePage: Resolver<
  Promise<DbPage>,
  {},
  GraphQLContext,
  MutationUpdatePageArgs
> = async (_, { accountId, metadataId, properties }, { dataSources }) => {
  return await dataSources.db.transaction(async (client) => {
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const entity = await client.getLatestEntityVersion({
      accountId,
      metadataId,
    });
    if (!entity) {
      throw new ApolloError(`page ${metadataId} not found`, "NOT_FOUND");
    }

    const updatedEntities = await client.updateEntity({
      accountId,
      entityVersionId: entity.entityVersionId,
      metadataId: entity.metadataId,
      properties: {
        ...(entity.properties ?? {}),
        ...properties,
      },
      type: "Page",
    });

    // @todo: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    return {
      ...updatedEntities[0],
      type: "Page",
      id: updatedEntities[0].entityVersionId,
      accountId: updatedEntities[0].accountId,
      visibility: Visibility.Public, // @todo: get from entity metadata
    };
  });
};
