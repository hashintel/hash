import {
  deleteComment,
  getCommentById,
} from "../../../../graph/knowledge/system-types/comment";
import { MutationDeleteCommentArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const deleteCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationDeleteCommentArgs
> = async (_, { entityId }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const comment = await getCommentById(context, authentication, {
    entityId,
  });

  const updatedComment = await deleteComment(context, authentication, {
    comment,
  });

  return mapCommentToGQL(updatedComment);
};
