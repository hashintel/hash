import {
  deleteComment,
  getCommentById,
} from "../../../../graph/knowledge/system-types/comment";
import { MutationDeleteCommentArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapCommentToGQL } from "../graphql-mapping";

export const deleteCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteCommentArgs
> = async (_, { entityId }, { dataSources: { graphApi }, user }) => {
  const comment = await getCommentById(
    { graphApi },
    {
      entityId,
    },
  );

  const updatedComment = await deleteComment(
    { graphApi },
    {
      comment,
      actorId: user.accountId,
    },
  );

  return mapCommentToGQL(updatedComment);
};
