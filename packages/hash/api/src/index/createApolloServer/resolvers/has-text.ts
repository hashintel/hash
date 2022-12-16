import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { CommentModel } from "../../auth/model";
import { ResolverFn } from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";
import { UnresolvedCommentGQL } from "./page/update-page-contents/model-mapping";
import { SYSTEM_TYPES } from "../../auth/model/entity.model/entity-type/graph/system-types";

export const commentHasText: ResolverFn<
  Promise<TextToken[]>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const { graphApi } = dataSources;
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId: metadata.editionId.baseId,
  });
  const textEntityModel = await commentModel.getHasText(graphApi);

  // @todo implement `TextModel` class so that a `TextModel.getTokens()` method can be used here
  return (
    (textEntityModel.getProperties() as any)[
      SYSTEM_TYPES.propertyType.tokens.metadata.editionId.baseId
    ] ?? []
  );
};
