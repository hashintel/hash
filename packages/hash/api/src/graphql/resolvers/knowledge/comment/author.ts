import { ApolloError } from "apollo-server-errors";
import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  UnresolvedPersistedEntityGQL,
  mapEntityModelToGQL,
} from "../model-mapping";

export const persistedCommentAuthor: ResolverFn<
  Promise<UnresolvedPersistedEntityGQL>,
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

  const author = await comment.getAuthor(graphApi);

  return mapEntityModelToGQL(author);
};
