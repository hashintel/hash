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
> = async (_, { entityId }, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const page = await getPageById(context, {
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
  { ownedById, properties: { title, prevIndex } },
  { dataSources, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const page = await createPage(context, {
    ownedById,
    title,
    prevIndex: prevIndex ?? undefined,
    actorId: user.accountId,
  });

  return mapPageToGQL(page);
};

export const parentPageResolver: ResolverFn<
  Promise<UnresolvedPageGQL | null>,
  UnresolvedPageGQL,
  GraphQLContext,
  QueryPagesArgs
> = async (pageGql, _, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const page = await getPageById(context, {
    entityId: pageGql.metadata.recordId.entityId,
  });
  const parentPage = await getPageParentPage(context, { page });

  return parentPage ? mapPageToGQL(parentPage) : null;
};

export const pagesResolver: ResolverFn<
  Promise<UnresolvedPageGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPagesArgs
> = async (_, { ownedById }, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const accountId = ownedById ?? user.accountId;

  const pages = await getAllPagesInWorkspace(context, {
    accountId,
  });

  return pages.map(mapPageToGQL);
};

export const pageCommentsResolver: ResolverFn<
  Promise<UnresolvedCommentGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPageCommentsArgs
> = async (_, { entityId }, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const comments = await getPageComments(context, { pageEntityId: entityId });

  return comments.map(mapCommentToGQL);
};
