import { CommentModel } from "../../auth/model";
import { ResolverFn } from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";
import {
  UnresolvedCommentGQL,
  mapCommentModelToGQL,
} from "./page/update-page-contents/model-mapping";

export const commentReplies: ResolverFn<
  Promise<UnresolvedCommentGQL[]>,
  UnresolvedCommentGQL,
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
