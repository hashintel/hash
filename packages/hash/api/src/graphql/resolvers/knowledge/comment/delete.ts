import {
  deleteComment,
  getCommentById,
} from "../../../../graph/knowledge/system-types/comment";
import { MutationDeleteCommentArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const deleteCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteCommentArgs
> = async (_, { entityId }, { dataSources, user }) => {
  const ctx = dataSourceToImpureGraphContext(dataSources);

  const comment = await getCommentById(ctx, {
    entityId,
  });

  const updatedComment = await deleteComment(ctx, {
    comment,
    actorId: user.accountId,
  });

  return mapCommentToGQL(updatedComment);
};
