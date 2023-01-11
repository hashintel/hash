import {
  getCommentById,
  getCommentReplies,
} from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const commentRepliesResolver: ResolverFn<
  Promise<UnresolvedCommentGQL[]>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const comment = await getCommentById(context, {
    entityId: metadata.editionId.baseId,
  });
  const replies = await getCommentReplies(context, { comment });

  return replies.filter((reply) => !reply.deletedAt).map(mapCommentToGQL);
};
