import type { TextToken } from "@local/hash-isomorphic-utils/types";

import { getCommentText } from "../../../../graph/knowledge/system-types/comment";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedCommentGQL } from "../graphql-mapping";

export const commentHasTextResolver: ResolverFn<
  TextToken[],
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const text = await getCommentText(context, authentication, {
    commentEntityId: metadata.recordId.entityId,
  });

  return text.textualContent;
};
