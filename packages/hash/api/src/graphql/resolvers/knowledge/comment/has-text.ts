import { TextToken } from "@hashintel/hash-shared/graphql/types";

import {
  getCommentById,
  getCommentText,
} from "../../../../graph/knowledge/system-types/comment";
import { SYSTEM_TYPES } from "../../../../graph/system-types";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";
import { UnresolvedCommentGQL } from "../graphql-mapping";

export const commentHasTextResolver: ResolverFn<
  Promise<TextToken[]>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const ctx = dataSourceToImpureGraphContext(dataSources);

  const comment = await getCommentById(ctx, {
    entityId: metadata.editionId.baseId,
  });
  const textEntity = await getCommentText(ctx, { comment });

  // @todo implement `Text` class so that a `Text.getTokens()` method can be used here
  return (
    (textEntity.properties[
      SYSTEM_TYPES.propertyType.tokens.metadata.editionId.baseId
    ] as TextToken[] | undefined) ?? []
  );
};
