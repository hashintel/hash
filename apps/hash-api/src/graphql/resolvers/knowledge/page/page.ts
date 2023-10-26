import { OwnedById } from "@local/hash-subgraph";

import {
  createPage,
  getAllPagesInWorkspace,
  getPageById,
  getPageComments,
  getPageParentPage,
} from "../../../../graph/knowledge/system-types/page";
import {
  MutationCreatePageArgs,
  QueryPageArgs,
  QueryPageCommentsArgs,
  QueryPagesArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
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
> = async (_, { entityId }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const page = await getPageById(context, authentication, {
    entityId,
  });

  return mapPageToGQL(page);
};

export const createPageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (
  _,
  { ownedById, properties: { title, prevFractionalIndex } },
  { dataSources, authentication },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const page = await createPage(context, authentication, {
    ownedById,
    title,
    prevFractionalIndex: prevFractionalIndex ?? undefined,
  });

  return mapPageToGQL(page);
};

export const parentPageResolver: ResolverFn<
  UnresolvedPageGQL | null,
  UnresolvedPageGQL,
  GraphQLContext,
  QueryPagesArgs
> = async (pageGql, _, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const page = await getPageById(context, authentication, {
    entityId: pageGql.metadata.recordId.entityId,
  });
  const parentPage = await getPageParentPage(context, authentication, { page });

  return parentPage ? mapPageToGQL(parentPage) : null;
};

export const pagesResolver: ResolverFn<
  Promise<UnresolvedPageGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPagesArgs
> = async (
  _,
  { ownedById, includeArchived },
  { dataSources, authentication, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const accountId = ownedById ?? user.accountId;

  const pages = await getAllPagesInWorkspace(context, authentication, {
    ownedById: accountId as OwnedById,
    includeArchived: includeArchived ?? false,
  });

  return pages.map(mapPageToGQL);
};

export const pageCommentsResolver: ResolverFn<
  Promise<UnresolvedCommentGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPageCommentsArgs
> = async (_, { entityId }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const comments = await getPageComments(context, authentication, {
    pageEntityId: entityId,
  });

  return comments.map(mapCommentToGQL);
};
