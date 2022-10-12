import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  UnresolvedPersistedEntityGQL,
  mapEntityModelToGQL,
} from "../model-mapping";

export const persistedCommentParent: ResolverFn<
  Promise<UnresolvedPersistedEntityGQL>,
  UnresolvedPersistedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ entityId }, _, { dataSources: { graphApi } }) => {
  const comment = await CommentModel.getCommentById(graphApi, { entityId });
  const parent = await comment.getParent(graphApi);

  return mapEntityModelToGQL(parent);
};
