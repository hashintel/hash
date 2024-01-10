import { getCommentReplies } from "../../../../graph/knowledge/system-types/comment";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import type { UnresolvedCommentGQL } from "../graphql-mapping";
import { mapCommentToGQL } from "../graphql-mapping";

export const commentRepliesResolver: ResolverFn<
  UnresolvedCommentGQL[],
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const replies = await getCommentReplies(context, authentication, {
    commentEntityId: metadata.recordId.entityId,
  });

  return replies.filter((reply) => !reply.deletedAt).map(mapCommentToGQL);
};
