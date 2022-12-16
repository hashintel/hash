import { CommentModel, EntityModel } from "../../auth/model";

import {
  MutationCreateCommentArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";
import {
  UnresolvedCommentGQL,
  mapCommentModelToGQL,
} from "./page/update-page-contents/model-mapping";

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
