import type { SerializedEntity } from "@local/hash-graph-sdk/entity";

import { getCommentParent } from "../../../../graph/knowledge/system-types/comment.js";
import type { ResolverFn } from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type { UnresolvedCommentGQL } from "../graphql-mapping.js";

export const commentParentResolver: ResolverFn<
  Promise<SerializedEntity>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  return getCommentParent(context, authentication, {
    commentEntityId: metadata.recordId.entityId,
  }).then((parent) => parent.toJSON());
};
