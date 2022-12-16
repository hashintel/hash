import { CommentModel } from "../../auth/model";
import {
  MutationDeleteCommentArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";
import {
  UnresolvedCommentGQL,
  mapCommentModelToGQL,
} from "./page/update-page-contents/model-mapping";

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
