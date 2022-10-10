import { ApolloError } from "apollo-server-errors";
import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedPersistedCommentGQL } from "../model-mapping";

export const persistedCommentTextUpdatedAt: ResolverFn<
  Promise<string>,
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

  const textEntity = await comment.getHasText(graphApi);

  return textEntity.version;
};
