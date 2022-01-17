import { ApolloError } from "apollo-server-express";

import { MutationUpdatePageArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Entity, UnresolvedGQLEntity } from "../../../model";

export const updatePage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageArgs
> = async (_, { accountId, entityId, properties }, { dataSources, user }) => {
  return await dataSources.db.transaction(async (client) => {
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const entity = await Entity.getEntityLatestVersion(client, {
      accountId,
      entityId,
    });
    if (!entity) {
      throw new ApolloError(
        `page with fixed ID ${entity} not found`,
        "NOT_FOUND",
      );
    }
    // @todo: lock entity to prevent potential race-condition when updating entity's properties
    await entity.updateEntityProperties(client, {
      properties: {
        ...(entity.properties ?? {}),
        ...properties,
      },
      updatedByAccountId: user.accountId,
    });

    // @todo: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    return entity.toGQLUnknownEntity();
  });
};
