import { TextToken } from "@local/hash-graphql-shared/graphql/types";

import { getCommentText } from "../../../../graph/knowledge/system-types/comment";
import { SYSTEM_TYPES } from "../../../../graph/system-types";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { UnresolvedCommentGQL } from "../graphql-mapping";

export const commentHasTextResolver: ResolverFn<
  TextToken[],
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const textEntity = await getCommentText(context, authentication, {
    commentEntityId: metadata.recordId.entityId,
  });

  // @todo implement `Text` class so that a `Text.getTokens()` method can be used here
  return (
    (textEntity.properties[
      SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl
    ] as TextToken[] | undefined) ?? []
  );
};
