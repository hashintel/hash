import { CommentModel } from "../../../../model";
import { MutationDeleteCommentArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapCommentModelToGQL } from "../model-mapping";

export const deleteComment: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteCommentArgs
> = async (_, { entityId }, { dataSources: { graphApi }, userModel }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });

  const updatedCommentModel = await commentModel.delete(graphApi, {
    actorId: userModel.getEntityUuid(),
  });

  return mapCommentModelToGQL(updatedCommentModel);
};
