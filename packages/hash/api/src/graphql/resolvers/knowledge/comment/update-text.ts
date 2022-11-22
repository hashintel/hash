import { CommentModel } from "../../../../model";

import {
  MutationUpdatePersistedCommentTextArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  mapCommentModelToGQL,
} from "../model-mapping";

export const updatePersistedCommentText: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePersistedCommentTextArgs
> = async (
  _,
  { entityId, tokens },
  { dataSources: { graphApi }, userModel },
) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });

  const updatedCommentModel = await commentModel.updateText(graphApi, {
    actorId: userModel.entityUuid,
    tokens,
  });

  return mapCommentModelToGQL(updatedCommentModel);
};
