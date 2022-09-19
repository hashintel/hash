import { JsonValue } from "@blockprotocol/core";
import { ApolloError } from "apollo-server-express";
import {
  Comment,
  UnresolvedGQLComment,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import { ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

const contents: ResolverFn<
  Promise<JsonValue>,
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

  return content.properties.tokens || [];
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

  if (!parentEntity) {
    throw new ApolloError(
      `Parent Entity not found in account ${accountId} for comment with entityId ${entityId}`,
      "NOT_FOUND",
    );
  }

  return parentEntity?.toGQLUnknownEntity();
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

  if (!ownerEntity) {
    throw new ApolloError(
      `Owner Entity not found in account ${accountId} for comment with entityId ${entityId}`,
      "NOT_FOUND",
    );
  }

  return ownerEntity?.toGQLUnknownEntity();
};

export const commentLinkedEntities = {
  contents,
  parent,
  owner,
};
