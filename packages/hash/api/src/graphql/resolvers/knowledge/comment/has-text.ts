import { TextToken } from "@local/hash-isomorphic-utils/graphql/types";

import {
  getCommentById,
  getCommentText,
} from "../../../../graph/knowledge/system-types/comment";
import { SYSTEM_TYPES } from "../../../../graph/system-types";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { UnresolvedCommentGQL } from "../graphql-mapping";

export const commentHasTextResolver: ResolverFn<
  Promise<TextToken[]>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const comment = await getCommentById(context, {
    entityId: metadata.editionId.baseId,
  });
  const textEntity = await getCommentText(context, { comment });

  // @todo implement `Text` class so that a `Text.getTokens()` method can be used here
  return (
    (textEntity.properties[
      SYSTEM_TYPES.propertyType.tokens.metadata.editionId.baseId
    ] as TextToken[] | undefined) ?? []
  );
};
