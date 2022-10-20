import { CommentModel, EntityModel } from "../../../../model";

import {
  MutationCreatePersistedCommentArgs,
  MutationEditPersistedCommentArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  mapCommentModelToGQL,
} from "../model-mapping";

export const createPersistedComment: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePersistedCommentArgs
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
    ownedById: parentModel.ownedById,
    parent: parentModel,
    author: userModel,
    actorId: userModel.entityId,
  });

  return mapCommentModelToGQL(commentModel);
};

export const editPersistedComment: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationEditPersistedCommentArgs
> = async (_, { entityId, tokens }, { dataSources: { graphApi }, user }) => {
  const commentModel = await CommentModel.editComment(graphApi, {
    entityId,
    tokens,
  });

  return mapCommentModelToGQL(commentModel);
};
