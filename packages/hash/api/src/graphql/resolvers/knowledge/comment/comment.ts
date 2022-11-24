import { CommentModel, EntityModel } from "../../../../model";

import { MutationCreateCommentArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapCommentModelToGQL } from "../model-mapping";

export const createComment: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreateCommentArgs
> = async (
  _,
  { parentEntityId, tokens },
  { dataSources: { graphApi }, userModel },
) => {
  const parentModel = await EntityModel.getLatest(graphApi, {
    entityId: parentEntityId,
  });

  const commentModel = await CommentModel.createComment(graphApi, {
    tokens,
    ownedById: parentModel.getOwnedById(),
    parent: parentModel,
    author: userModel,
    actorId: userModel.getEntityUuid(),
  });

  return mapCommentModelToGQL(commentModel);
};
