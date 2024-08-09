import {
  getCommentById,
  resolveComment,
} from "../../../../graph/knowledge/system-types/comment.js";
import type {
  MutationResolveCommentArgs,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type { UnresolvedCommentGQL } from "../graphql-mapping.js";
import { mapCommentToGQL } from "../graphql-mapping.js";

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
