import { CommentModel } from "../../../../model";
import { EntityWithMetadata, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  mapEntityModelToGQL,
} from "../model-mapping";

export const persistedCommentAuthor: ResolverFn<
  Promise<EntityWithMetadata>,
  UnresolvedPersistedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId: metadata.editionId.baseId,
  });
  const authorModel = await commentModel.getAuthor(graphApi);

  return mapEntityModelToGQL(authorModel);
};
