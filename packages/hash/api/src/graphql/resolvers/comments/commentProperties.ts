import { ApolloError } from "apollo-server-express";
import { Comment, UnresolvedGQLComment } from "../../../model";
import {
  CommentProperties as GQLCommentProperties,
  ResolverFn,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const commentProperties: ResolverFn<
  Promise<GQLCommentProperties>,
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

  return {
    ...comment.properties,
    commentEntityId: entityId,
  };
};
