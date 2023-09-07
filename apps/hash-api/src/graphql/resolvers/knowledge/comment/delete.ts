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
  {},
  LoggedInGraphQLContext,
  MutationDeleteCommentArgs
> = async (_, { entityId }, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const comment = await getCommentById(
    context,
    { actorId: user.accountId },
    {
      entityId,
    },
  );

  const updatedComment = await deleteComment(
    context,
    { actorId: user.accountId },
    {
      comment,
    },
  );

  return mapCommentToGQL(updatedComment);
};
