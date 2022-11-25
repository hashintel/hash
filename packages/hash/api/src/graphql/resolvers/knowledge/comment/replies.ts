import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  mapCommentModelToGQL,
} from "../model-mapping";

export const persistedCommentReplies: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL[]>,
  UnresolvedPersistedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId: metadata.editionId.baseId,
  });
  const replyModels = await commentModel.getReplies(graphApi);

  return replyModels
    .filter((replyModel) => !replyModel.getDeletedAt())
    .map(mapCommentModelToGQL);
};
