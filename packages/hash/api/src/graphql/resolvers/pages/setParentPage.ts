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
  { accountId, pageEntityId, parentPageEntityId },
  { dataSources: { db }, user },
) => {
  if (pageEntityId === parentPageEntityId) {
    throw new ApolloError("A page cannot be the parent of itself");
  }

  return await db.transaction(async (client) => {
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

    let parentPage: Page | null = null;

    if (parentPageEntityId) {
      parentPage = await Page.getPageById(client, {
        accountId,
        entityId: parentPageEntityId,
      });

      if (!parentPage) {
        throw new ApolloError(
          `Could not find parent page entity with entityId = ${parentPageEntityId} on account with id = ${accountId}.`,
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
