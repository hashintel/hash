import { Entity } from "@hashintel/hash-subgraph";
import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapEntityModelToGQL } from "../model-mapping";

export const commentAuthor: ResolverFn<
  Promise<Entity>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId: metadata.editionId.baseId,
  });
  const authorModel = await commentModel.getAuthor(graphApi);

  return mapEntityModelToGQL(authorModel);
};
