import {
  createPage,
  getPageComments,
} from "../../../../graph/knowledge/system-types/page";
import {
  MutationCreatePageArgs,
  QueryPageCommentsArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import {
  mapCommentToGQL,
  mapPageToGQL,
  UnresolvedCommentGQL,
  UnresolvedPageGQL,
} from "../graphql-mapping";

export const createPageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (
  _,
  { ownedById, properties: { title, prevFractionalIndex, type } },
  { dataSources, authentication },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const page = await createPage(context, authentication, {
    ownedById,
    title,
    prevFractionalIndex: prevFractionalIndex ?? undefined,
    type,
  });

  return mapPageToGQL(page);
};

export const pageCommentsResolver: ResolverFn<
  Promise<UnresolvedCommentGQL[]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryPageCommentsArgs
> = async (_, { entityId }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const comments = await getPageComments(context, authentication, {
    pageEntityId: entityId,
  });

  return comments.map(mapCommentToGQL);
};
