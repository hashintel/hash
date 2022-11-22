import { EntityVersion } from "@hashintel/hash-subgraph";
import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedPersistedCommentGQL } from "../model-mapping";

export const persistedCommentTextUpdatedAt: ResolverFn<
  Promise<EntityVersion>,
  UnresolvedPersistedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId: metadata.editionId.baseId,
  });
  const textEntityModel = await commentModel.getHasText(graphApi);

  return textEntityModel.getVersion();
};
