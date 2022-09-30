import { ApolloError } from "apollo-server-express";
import { Comment, UnresolvedGQLComment } from "../../../model";
import { ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const textUpdatedAt: ResolverFn<
  Promise<string>,
  UnresolvedGQLComment,
  GraphQLContext,
  {}
> = async ({ accountId, entityId }, _, { dataSources }) => {
  const { db } = dataSources;
  const comment = await Comment.getCommentById(db, { accountId, entityId });

  if (!comment) {
    throw new ApolloError(
      `Comment with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const textTokens = await comment.getTokens(db);

  if (!textTokens) {
    throw new ApolloError(
      `Text Entity not found for Comment with entityId ${entityId} in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  return textTokens.updatedAt.toISOString();
};
