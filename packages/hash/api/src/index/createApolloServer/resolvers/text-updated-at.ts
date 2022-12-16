import { EntityVersion } from "@hashintel/hash-subgraph";
import { CommentModel } from "../../auth/model";
import { ResolverFn } from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";
import { UnresolvedCommentGQL } from "./page/update-page-contents/model-mapping";

export const commentTextUpdatedAt: ResolverFn<
  Promise<EntityVersion>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId: metadata.editionId.baseId,
  });
  const textEntityModel = await commentModel.getHasText(graphApi);

  return textEntityModel.getVersion();
};
