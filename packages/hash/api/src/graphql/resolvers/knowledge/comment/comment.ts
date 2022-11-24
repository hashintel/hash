import { CommentModel, EntityModel } from "../../../../model";

import {
  MutationCreatePersistedCommentArgs,
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
    ownedById: parentModel.getOwnedById(),
    parent: parentModel,
    author: userModel,
    actorId: userModel.getEntityUuid(),
  });

  return mapCommentModelToGQL(commentModel);
};
