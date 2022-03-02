import { ApolloError } from "apollo-server-express";
import { MutationSetParentPageArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Page, UnresolvedGQLEntity } from "../../../model";

export const setParentPage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationSetParentPageArgs
> = async (
  _,
  { accountId, pageId, parentPageId },
  { dataSources: { db }, user },
) => {
  if (pageId === parentPageId) {
    throw new ApolloError("A page cannot be the parent of itself");
  }

  return await db.transaction(async (client) => {
    const pageEntity = await Page.getPageById(client, {
      accountId,
      entityId: pageId,
    });

    if (!pageEntity) {
      throw new ApolloError(
        `Could not find page entity with entityId = ${pageId} on account with id = ${accountId}.`,
        "NOT_FOUND",
      );
    }

    let parentPage: Page | null = null;

    if (parentPageId) {
      parentPage = await Page.getPageById(client, {
        accountId,
        entityId: parentPageId,
      });

      if (!parentPage) {
        throw new ApolloError(
          `Could not find parent page entity with entityId = ${parentPageId} on account with id = ${accountId}.`,
          "NOT_FOUND",
        );
      }
    }

    await pageEntity.setParentPage(client, {
      parentPage,
      setByAccountId: user.accountId,
    });

    return pageEntity.toGQLUnknownEntity();
  });
};
