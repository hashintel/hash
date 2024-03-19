import {
  deleteComment,
  getCommentById,
} from "../../../../graph/knowledge/system-types/comment";
import type {
  MutationDeleteCommentArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedCommentGQL } from "../graphql-mapping";
import { mapCommentToGQL } from "../graphql-mapping";

export const deleteCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationDeleteCommentArgs
> = async (_, { entityId }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const comment = await getCommentById(context, authentication, {
    entityId,
  });

  const updatedComment = await deleteComment(context, authentication, {
    comment,
  });

  return mapCommentToGQL(updatedComment);
};
