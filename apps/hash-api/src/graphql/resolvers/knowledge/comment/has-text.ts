import type { TextToken } from "@local/hash-isomorphic-utils/types";

import { getCommentText } from "../../../../graph/knowledge/system-types/comment.js";
import type { ResolverFn } from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type { UnresolvedCommentGQL } from "../graphql-mapping.js";

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
