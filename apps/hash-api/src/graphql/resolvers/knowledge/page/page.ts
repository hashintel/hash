import {
  createPage,
  getPageById,
  getPageComments,
} from "../../../../graph/knowledge/system-types/page";
import {
  MutationCreatePageArgs,
  QueryPageArgs,
  QueryPageCommentsArgs,
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
