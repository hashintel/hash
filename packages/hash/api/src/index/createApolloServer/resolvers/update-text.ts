import { CommentModel } from "../../auth/model";

import {
  MutationUpdateCommentTextArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";
import {
  UnresolvedCommentGQL,
  mapCommentModelToGQL,
} from "./page/update-page-contents/model-mapping";

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
