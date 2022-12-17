import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL } from "../graphql-mapping";
import { SYSTEM_TYPES } from "../../../../graph/system-types";
import {
  getCommentById,
  getCommentText,
} from "../../../../graph/knowledge/system-types/comment";

export const commentHasTextResolver: ResolverFn<
  Promise<TextToken[]>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const { graphApi } = dataSources;
  const comment = await getCommentById(
    { graphApi },
    {
      entityId: metadata.editionId.baseId,
    },
  );
  const textEntity = await getCommentText({ graphApi }, { comment });

  // @todo implement `Text` class so that a `Text.getTokens()` method can be used here
  return (
    (textEntity.properties[
      SYSTEM_TYPES.propertyType.tokens.metadata.editionId.baseId
    ] as TextToken[]) ?? []
  );
};
