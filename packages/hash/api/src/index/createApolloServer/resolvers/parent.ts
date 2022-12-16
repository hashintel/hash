import { Entity } from "@hashintel/hash-subgraph";
import { CommentModel } from "../../auth/model";
import { ResolverFn } from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";
import {
  UnresolvedCommentGQL,
  mapEntityModelToGQL,
} from "./page/update-page-contents/model-mapping";

export const commentParent: ResolverFn<
  Promise<Entity>,
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
