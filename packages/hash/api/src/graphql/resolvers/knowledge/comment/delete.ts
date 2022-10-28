import { CommentModel } from "../../../../model";
import {
  MutationDeletePersistedCommentArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  mapCommentModelToGQL,
} from "../model-mapping";

export const deletePersistedComment: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationDeletePersistedCommentArgs
> = async (_, { entityId }, { dataSources: { graphApi }, userModel }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });

  const updatedCommentModel = await commentModel.delete(graphApi, {
    actorId: userModel.entityId,
  });

  return mapCommentModelToGQL(updatedCommentModel);
};
