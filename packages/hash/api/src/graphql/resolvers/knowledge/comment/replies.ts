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
> = async ({ entityId }, _, { dataSources: { graphApi } }) => {
  const comment = await CommentModel.getCommentById(graphApi, { entityId });
  const replies = await comment.getReplies(graphApi);

  return replies.map(mapCommentModelToGQL);
};
