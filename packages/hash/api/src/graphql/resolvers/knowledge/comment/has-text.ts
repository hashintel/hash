import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  UnresolvedEntityWithMetadataGQL,
} from "../model-mapping";
import { SYSTEM_TYPES } from "../../../../graph/system-types";

export const persistedCommentHasText: ResolverFn<
  Promise<UnresolvedEntityWithMetadataGQL[]>,
  UnresolvedPersistedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ entityId }, _, { dataSources }) => {
  const { graphApi } = dataSources;
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });
  const textEntityModel = await commentModel.getHasText(graphApi);

  // @todo implement `TextModel` class so that a `TextModel.getTokens()` method can be used here
  return (
    (textEntityModel.properties as any)[
      SYSTEM_TYPES.propertyType.tokens.baseUri
    ] ?? []
  );
};
