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
> = async (_, { accountId, id, properties }, { dataSources }) => {
  return await dataSources.db.transaction(async (client) => {
    const entity = await client.getEntity({ accountId, entityId: id }, true);
    if (!entity) {
      throw new ApolloError(`page ${id} not found`, "NOT_FOUND");
    }

    const updatedEntities = await client.updateEntity({
      accountId,
      entityId: id,
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
      id: updatedEntities[0].entityId,
      accountId: updatedEntities[0].accountId,
      visibility: Visibility.Public, // @todo: get from entity metadata
    };
  });
};
