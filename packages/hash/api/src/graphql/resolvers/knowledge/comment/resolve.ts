import { CommentModel } from "../../../../model";
import { MutationResolveCommentArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapCommentModelToGQL } from "../model-mapping";

export const resolveComment: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationResolveCommentArgs
> = async (_, { entityId }, { dataSources: { graphApi }, userModel }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });

  const updatedCommentModel = await commentModel.resolve(graphApi, {
    actorId: userModel.getEntityUuid(),
  });

  return mapCommentModelToGQL(updatedCommentModel);
};
