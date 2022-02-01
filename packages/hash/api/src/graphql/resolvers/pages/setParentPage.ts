import { ApolloError } from "apollo-server-express";
import { MutationSetParentPageArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Entity, Page, UnresolvedGQLEntity } from "../../../model";
import { topologicalSort } from "../../../util";

export const setParentPage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationSetParentPageArgs
> = async (_, { accountId, pageId, parentPageId }, { dataSources, user }) => {
  return await dataSources.db.transaction(async (client) => {
    const [pageEntity, parentPageEntity] = await Promise.all([
      Page.getAccountPageWithParents(client, {
        accountId,
        entityId: pageId,
      }),

      Entity.getEntityLatestVersion(client, {
        accountId,
        entityId: parentPageId,
      }),
    ]);

    if (!pageEntity || !parentPageEntity) {
      const notFoundId = pageEntity?.entityId
        ? `'${parentPageId}'`
        : `'${pageId}'${
            parentPageEntity?.entityId
              ? ""
              : ` nor parent page with entityId = '${parentPageId}'`
          }`;
      throw new ApolloError(
        `Could not find entity with entityId = ${notFoundId}.`,
        "NOT_FOUND",
      );
    }

    if (pageEntity.parentEntityId) {
      throw new Error(
        `Page with entityId = '${pageEntity.entityId}' already has parent page entityId = '${pageEntity.parentEntityId}'`,
      );
    }

    const pages = await Page.getAccountPagesWithParents(dataSources.db, {
      accountId,
      systemTypeName: "Page",
    });

    // Check for cyclic dependencies.
    try {
      const directedPages = pages
        .filter((page) => page.parentEntityId != null)
        .map(
          (page) => [page.entityId, page.parentEntityId] as [string, string],
        );
      // add the new parent relation to the existing relations
      directedPages.push([pageId, parentPageId]);
      topologicalSort(directedPages);
    } catch (_error) {
      throw new ApolloError(
        `Could not set '${parentPageId}' as parent to '${pageId}' as this would create a cyclic dependency.`,
        "CYCLIC_TREE",
      );
    }

    // @todo: lock entity to prevent potential race-condition when updating entity's properties
    await pageEntity.createOutgoingLink(client, {
      createdByAccountId: user.accountId,
      stringifiedPath: "$.parent",
      destination: parentPageEntity,
    });

    return pageEntity.toGQLUnknownEntity();
  });
};
