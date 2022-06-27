import { ApolloError } from "apollo-server-express";
import { MutationArchivePageArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Page, UnresolvedGQLEntity } from "../../../model";

export const archivePage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationArchivePageArgs
> = async (_, { accountId, pageEntityId }, { dataSources }) => {
  return await dataSources.db.transaction(async (client) => {
    const pageEntity = await Page.getPageById(client, {
      accountId,
      entityId: pageEntityId,
    });

    if (!pageEntity) {
      throw new ApolloError(
        `Could not find page entity with entityId = ${pageEntityId} on account with id = ${accountId}.`,
        "NOT_FOUND",
      );
    }

    await pageEntity.archivePage(client);

    return pageEntity.toGQLUnknownEntity();
  });
};
