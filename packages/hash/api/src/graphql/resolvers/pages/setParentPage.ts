import { ApolloError } from "apollo-server-express";
import { MutationSetParentPageArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Entity, Link, Page, UnresolvedGQLEntity } from "../../../model";

export const setParentPage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationSetParentPageArgs
> = async (_, { accountId, pageId, parentPageId }, { dataSources, user }) => {
  return await dataSources.db.transaction(async (client) => {
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const pageEntity = await Page.getAccountPageWithParents(client, {
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

    if (pageEntity.parentEntityId) {
      throw new Error(
        `Page with entityId = '${pageEntity.entityId}' already has parent page entityId = '${pageEntity.parentEntityId}'`,
      );
    }

    const link = await Link.getLinkInAnyDirection(dataSources.db, {
      accountId,
      entityIdOne: pageId,
      entityIdTwo: parentPageId,
    });

    if (link) {
      throw new ApolloError(
        `Could not set ${parentPageId} as parent to ${pageId} as this would create a cyclic dependency.`,
        "CYCLIC_TREE",
      );
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
