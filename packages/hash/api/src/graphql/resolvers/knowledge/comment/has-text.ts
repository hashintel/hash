import { CommentModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  UnresolvedPersistedEntityGQL,
} from "../model-mapping";
import { WORKSPACE_TYPES } from "../../../../graph/workspace-types";

export const persistedCommentHasText: ResolverFn<
  Promise<UnresolvedPersistedEntityGQL[]>,
  UnresolvedPersistedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ entityId }, _, { dataSources }) => {
  const { graphApi } = dataSources;
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });
  const textEntityModel = await commentModel.getHasText(graphApi);

  // @todo Use getTokens() method from TextModel class
  return (
    (textEntityModel.properties as any)[
      WORKSPACE_TYPES.propertyType.tokens.baseUri
    ] ?? []
  );
};
