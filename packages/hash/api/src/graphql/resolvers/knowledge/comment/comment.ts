import { CommentModel, EntityModel } from "../../../../model";

import {
  MutationCreatePersistedCommentArgs,
  QueryPersistedPageCommentsArgs,
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
  { ownedById, parentEntityId, tokens },
  { dataSources: { graphApi }, user },
) => {
  const parent = await EntityModel.getLatest(graphApi, {
    entityId: parentEntityId,
  });

  const commentModel = await CommentModel.createComment(graphApi, {
    tokens,
    ownedById,
    parent,
    author: user,
  });

  return mapCommentModelToGQL(commentModel);
};

export const persistedPageComments: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPersistedPageCommentsArgs
> = async (_, { pageId }, { dataSources: { graphApi } }) => {
  const comments = await CommentModel.getAllCommentsInPage(graphApi, {
    pageId,
  });

  return comments.map(mapCommentModelToGQL);
};
