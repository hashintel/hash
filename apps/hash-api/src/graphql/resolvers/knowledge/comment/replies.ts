import { getCommentReplies } from "../../../../graph/knowledge/system-types/comment";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedCommentGQL } from "../graphql-mapping";
import { mapCommentToGQL } from "../graphql-mapping";

export const commentRepliesResolver: ResolverFn<
  UnresolvedCommentGQL[],
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const replies = await getCommentReplies(context, authentication, {
    commentEntityId: metadata.recordId.entityId,
  });

  return replies.filter((reply) => !reply.deletedAt).map(mapCommentToGQL);
};
