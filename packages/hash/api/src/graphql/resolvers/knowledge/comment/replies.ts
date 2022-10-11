import { ApolloError } from "apollo-server-errors";
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
> = async ({ entityId }, _, { dataSources }) => {
  const { graphApi } = dataSources;
  const comment = await CommentModel.getCommentById(graphApi, { entityId });

  if (!comment) {
    throw new ApolloError(
      `Comment with entityId ${entityId} not found`,
      "NOT_FOUND",
    );
  }

  const replies = await comment.getReplies(graphApi);

  return replies.map(mapCommentModelToGQL);
};
