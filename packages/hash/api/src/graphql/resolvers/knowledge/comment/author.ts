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
> = async ({ entityId }, _, { dataSources: { graphApi } }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });
  const authorModel = await commentModel.getAuthor(graphApi);

  return mapEntityModelToGQL(authorModel);
};
