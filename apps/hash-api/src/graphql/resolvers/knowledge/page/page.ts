import {
  createPage,
  getPageComments,
} from "../../../../graph/knowledge/system-types/page.js";
import type {
  MutationCreatePageArgs,
  QueryPageCommentsArgs,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type {
  UnresolvedCommentGQL,
  UnresolvedPageGQL,
} from "../graphql-mapping.js";
import { mapCommentToGQL, mapPageToGQL } from "../graphql-mapping.js";

export const createPageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (
  _,
  { ownedById, properties: { title, prevFractionalIndex, type } },
  graphQLContext,
) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const page = await createPage(context, graphQLContext.authentication, {
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
> = async (_, { entityId }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const comments = await getPageComments(
    context,
    graphQLContext.authentication,
    {
      pageEntityId: entityId,
    },
  );

  return comments.map(mapCommentToGQL);
};
