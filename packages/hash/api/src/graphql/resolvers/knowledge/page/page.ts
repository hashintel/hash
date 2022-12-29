import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
  Uuid,
} from "@hashintel/hash-shared/types";

import { getOrgById } from "../../../../graph/knowledge/system-types/org";
import {
  createPage,
  getAllPagesInWorkspace,
  getPageById,
  getPageComments,
  getPageParentPage,
} from "../../../../graph/knowledge/system-types/page";
import { getUserById } from "../../../../graph/knowledge/system-types/user";
import { systemUserAccountId } from "../../../../graph/system-user";
import { EntityTypeMismatchError } from "../../../../lib/error";
import {
  MutationCreatePageArgs,
  QueryPageArgs,
  QueryPageCommentsArgs,
  QueryPagesArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
import {
  mapCommentToGQL,
  mapPageToGQL,
  UnresolvedCommentGQL,
  UnresolvedPageGQL,
} from "../graphql-mapping";

export const pageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  GraphQLContext,
  QueryPageArgs
> = async (_, { entityId }, { dataSources: { graphApi } }) => {
  const page = await getPageById(
    { graphApi },
    {
      entityId,
    },
  );

  return mapPageToGQL(page);
};

export const createPageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (
  _,
  { ownedById, properties: { title, prevIndex } },
  { dataSources: { graphApi }, user },
) => {
  const page = await createPage(
    { graphApi },
    {
      ownedById,
      title,
      prevIndex: prevIndex ?? undefined,
      actorId: user.accountId,
    },
  );

  return mapPageToGQL(page);
};

export const parentPageResolver: ResolverFn<
  Promise<UnresolvedPageGQL | null>,
  UnresolvedPageGQL,
  GraphQLContext,
  QueryPagesArgs
> = async (pageGql, _, { dataSources: { graphApi } }) => {
  const page = await getPageById(
    { graphApi },
    {
      entityId: pageGql.metadata.editionId.baseId,
    },
  );
  const parentPage = await getPageParentPage({ graphApi }, { page });

  return parentPage ? mapPageToGQL(parentPage) : null;
};

export const pagesResolver: ResolverFn<
  Promise<UnresolvedPageGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPagesArgs
> = async (_, { ownedById }, { dataSources: { graphApi }, user }) => {
  const accountEntityId = ownedById
    ? entityIdFromOwnedByIdAndEntityUuid(
        systemUserAccountId as OwnedById,
        ownedById as Uuid as EntityUuid,
      )
    : undefined;

  const workspace = accountEntityId
    ? await getUserById(
        { graphApi },
        {
          entityId: accountEntityId,
        },
      ).catch((error: Error) => {
        if (error instanceof EntityTypeMismatchError) {
          return getOrgById({ graphApi }, { entityId: accountEntityId });
        }
        throw error;
      })
    : user;

  const pages = await getAllPagesInWorkspace(
    { graphApi },
    {
      workspace,
    },
  );

  return pages.map(mapPageToGQL);
};

export const pageCommentsResolver: ResolverFn<
  Promise<UnresolvedCommentGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPageCommentsArgs
> = async (_, { entityId }, { dataSources: { graphApi } }) => {
  const page = await getPageById(
    { graphApi },
    {
      entityId,
    },
  );

  const comments = await getPageComments({ graphApi }, { page });

  return comments.map(mapCommentToGQL);
};
