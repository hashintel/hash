import { ApolloError } from "apollo-server-express";
import { MutationSetParentPageArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Entity, UnresolvedGQLEntity } from "../../../model";

export const setParentPage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationSetParentPageArgs
> = async (_, { accountId, pageId, parentPageId }, { dataSources, user }) => {
  return await dataSources.db.transaction(async (client) => {
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const pageEntity = await Entity.getEntityLatestVersion(client, {
      accountId,
      entityId: pageId,
    });

    const parentPageEntity = await Entity.getEntityLatestVersion(client, {
      accountId,
      entityId: parentPageId,
    });

    if (!parentPageEntity || !pageEntity) {
      throw new ApolloError(`Could not find.`, "NOT_FOUND");
    }
    // @todo: lock entity to prevent potential race-condition when updating entity's properties
    await pageEntity.createOutgoingLink(client, {
      createdByAccountId: user.accountId,
      stringifiedPath: "$.parent",
      destination: parentPageEntity,
    });

    // @todo: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    return pageEntity.toGQLUnknownEntity();
  });
};
