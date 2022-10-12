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
  const comment = await CommentModel.getCommentById(graphApi, { entityId });
  const author = await comment.getAuthor(graphApi);

  return mapEntityModelToGQL(author);
};
