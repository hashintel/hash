import { EntityWithMetadata } from "@hashintel/hash-subgraph";
import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapEntityModelToGQL } from "../model-mapping";

export const commentParent: ResolverFn<
  Promise<EntityWithMetadata>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId: metadata.editionId.baseId,
  });
  const parentModel = await commentModel.getParent(graphApi);

  return mapEntityModelToGQL(parentModel);
};
