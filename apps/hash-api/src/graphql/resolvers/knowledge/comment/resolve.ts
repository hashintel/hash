import { getCommentById, resolveComment } from "../../../../graph/knowledge/system-types/comment";
import { graphQLContextToImpureGraphContext } from "../../util";
import { mapCommentToGQL } from "../graphql-mapping";

import type { MutationResolveCommentArgs, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import type { UnresolvedCommentGQL } from "../graphql-mapping";

export const resolveCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationResolveCommentArgs
> = async (_, { entityId }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const comment = await getCommentById(context, authentication, {
    entityId,
  });

  const updatedComment = await resolveComment(context, authentication, {
    comment,
  });

  return mapCommentToGQL(updatedComment);
};
