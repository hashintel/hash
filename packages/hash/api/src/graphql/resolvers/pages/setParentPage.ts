import { ApolloError } from "apollo-server-express";
import { MutationSetParentPageArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { DBClient } from "../../../db";
import { Entity, Page, UnresolvedGQLEntity, User } from "../../../model";
import { topologicalSort } from "../../../util";

async function deleteParentPage(
  client: DBClient,
  user: User,
  pageEntity: Page,
): Promise<void> {
  if (pageEntity.parentEntityId) {
    const link = await pageEntity.getOutgoingLinkByEntityId(client, {
      destinationEntityId: pageEntity.parentEntityId,
    });

    if (!link) {
      throw new Error(
        `Could not find existing link to parent page = '${pageEntity.parentEntityId}'.`,
      );
    }

    await pageEntity.deleteOutgoingLink(client, {
      linkId: link.linkId,
      deletedByAccountId: user.accountId,
    });
  }
}

async function replaceParentPage(
  client: DBClient,
  user: User,
  accountId: string,
  pageEntity: Page,
  parentPageId: string,
): Promise<void> {
  const parentPageEntity = await Entity.getEntityLatestVersion(client, {
    accountId,
    entityId: parentPageId,
  });

  if (!parentPageEntity) {
    throw new ApolloError(
      `Could not find (parent) page entity with entityId = ${parentPageId}  on account with id = ${accountId}.`,
      "NOT_FOUND",
    );
  }

  const pages = await Page.getAccountPagesWithParents(client, {
    accountId,
    systemTypeName: "Page",
  });

  const pageId = pageEntity.entityId;

  // Check for cyclic dependencies.
  try {
    const directedPages = pages
      .filter((page) => page.parentEntityId != null)
      .map((page) => [page.entityId, page.parentEntityId] as [string, string]);
    // add the new parent relation to the existing relations
    directedPages.push([pageId, parentPageId]);
    topologicalSort(directedPages);
  } catch (_error) {
    throw new ApolloError(
      `Could not set '${parentPageId}' as parent to '${pageId}' as this would create a cyclic dependency.`,
      "CYCLIC_TREE",
    );
  }

  await deleteParentPage(client, user, pageEntity);

  // @todo: lock entity to prevent potential race-condition when updating entity's properties
  await pageEntity.createOutgoingLink(client, {
    createdByAccountId: user.accountId,
    stringifiedPath: "$.parent",
    destination: parentPageEntity,
  });
}

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
  return await db.transaction(async (client) => {
    const pageEntity = await Page.getAccountPageWithParents(client, {
      accountId,
      entityId: pageId,
    });

    if (!pageEntity) {
      throw new ApolloError(
        `Could not find page entity with entityId = ${pageId} on account with id = ${accountId}.`,
        "NOT_FOUND",
      );
    }
    // Either replace a parent page link, or delete it depending on whether or not `parentPageId` is set.
    if (parentPageId) {
      await replaceParentPage(db, user, accountId, pageEntity, parentPageId);
    } else {
      await deleteParentPage(db, user, pageEntity);
    }

    // @todo: allow to refetch account page with parents
    // Refetched page exists here, but it could fail (return null) if the entity were to be removed before this point.
    // A Page model method to refetch would be ideal here.
    const refetchedPage = await Page.getAccountPageWithParents(client, {
      accountId,
      entityId: pageId,
    });

    return refetchedPage!.toGQLPageEntity();
  });
};
