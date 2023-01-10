import {
  getCommentById,
  getCommentReplies,
} from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const commentRepliesResolver: ResolverFn<
  Promise<UnresolvedCommentGQL[]>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const ctx = dataSourceToImpureGraphContext(dataSources);

  const comment = await getCommentById(ctx, {
    entityId: metadata.editionId.baseId,
  });
  const replies = await getCommentReplies(ctx, { comment });

  return replies.filter((reply) => !reply.deletedAt).map(mapCommentToGQL);
};
