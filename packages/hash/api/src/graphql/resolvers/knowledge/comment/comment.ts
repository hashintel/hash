import { ApolloError } from "apollo-server-express";
import { CommentModel, EntityModel } from "../../../../model";

import {
  MutationCreatePersistedCommentArgs,
  QueryPagePersistedCommentsArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  mapCommentModelToGQL,
} from "../model-mapping";

export const createPersistedComment: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePersistedCommentArgs
> = async (
  _,
  { ownedById, parentId, tokens },
  { dataSources: { graphApi }, user },
) => {
  const parent = await EntityModel.getLatest(graphApi, {
    entityId: parentId,
  });

  if (!parent) {
    throw new ApolloError(
      `Could not find parent entity with entityId ${parentId} on account ${ownedById}.`,
      "NOT_FOUND",
    );
  }

  const commentModel = await CommentModel.createComment(graphApi, {
    tokens,
    ownedById,
    parent,
    createdBy: user,
  });

  return mapCommentModelToGQL(commentModel);
};

export const persistedPageComments: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPagePersistedCommentsArgs
> = async (_, { ownedById, pageId }, { dataSources: { graphApi } }) => {
  const comments = await CommentModel.getAllCommentsInPage(graphApi, {
    ownedById,
    pageId,
  });

  return comments.map(mapCommentModelToGQL);
};
