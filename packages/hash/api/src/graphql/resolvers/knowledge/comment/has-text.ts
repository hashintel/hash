import { EntityWithMetadata } from "@hashintel/hash-subgraph";
import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedPersistedCommentGQL } from "../model-mapping";
import { SYSTEM_TYPES } from "../../../../graph/system-types";

export const persistedCommentHasText: ResolverFn<
  Promise<EntityWithMetadata[]>,
  UnresolvedPersistedCommentGQL,
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
    (textEntityModel.properties as any)[
      SYSTEM_TYPES.propertyType.tokens.baseUri
    ] ?? []
  );
};
