import {
  getCommentById,
  getCommentReplies,
} from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const commentRepliesResolver: ResolverFn<
  Promise<UnresolvedCommentGQL[]>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const comment = await getCommentById(
    { graphApi },
    {
      entityId: metadata.editionId.baseId,
    },
  );
  const replies = await getCommentReplies({ graphApi }, { comment });

  return replies.filter((reply) => !reply.deletedAt).map(mapCommentToGQL);
};
