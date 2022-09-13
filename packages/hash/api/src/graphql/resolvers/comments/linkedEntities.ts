import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { ApolloError } from "apollo-server-express";
import {
  Comment,
  UnresolvedGQLComment,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import { ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

const contents: ResolverFn<
  Promise<TextToken[]>,
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

  const content = await comment.getContents(db);

  return (content.properties.tokens || []) as TextToken[];
};

const parent: ResolverFn<
  Promise<UnresolvedGQLUnknownEntity | null>,
  UnresolvedGQLComment,
  GraphQLContext,
  {}
> = async ({ accountId, entityId }, _, { dataSources: { db } }) => {
  const comment = await Comment.getCommentById(db, { accountId, entityId });

  if (!comment) {
    throw new ApolloError(
      `Comment with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const parentEntity = await comment.getParent(db);

  return parentEntity?.toGQLUnknownEntity() ?? null;
};

const owner: ResolverFn<
  Promise<UnresolvedGQLUnknownEntity | null>,
  UnresolvedGQLComment,
  GraphQLContext,
  {}
> = async ({ accountId, entityId }, _, { dataSources: { db } }) => {
  const comment = await Comment.getCommentById(db, { accountId, entityId });

  if (!comment) {
    throw new ApolloError(
      `Comment with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const ownerEntity = await comment.getOwner(db);

  return ownerEntity?.toGQLUnknownEntity() ?? null;
};

export const commentLinkedEntities = {
  contents,
  parent,
  owner,
};
