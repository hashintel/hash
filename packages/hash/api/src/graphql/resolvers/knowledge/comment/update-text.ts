import { CommentModel } from "../../../../model";

import {
  MutationUpdateCommentTextArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapCommentModelToGQL } from "../model-mapping";

export const updateCommentText: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateCommentTextArgs
> = async (
  _,
  { entityId, tokens },
  { dataSources: { graphApi }, userModel },
) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });

  const updatedCommentModel = await commentModel.updateText(graphApi, {
    actorId: userModel.getEntityUuid(),
    tokens,
  });

  return mapCommentModelToGQL(updatedCommentModel);
};
