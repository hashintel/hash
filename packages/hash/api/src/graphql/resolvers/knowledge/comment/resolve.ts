import {
  getCommentById,
  resolveComment,
} from "../../../../graph/knowledge/system-types/comment";
import { MutationResolveCommentArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapCommentToGQL } from "../graphql-mapping";

export const resolveCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationResolveCommentArgs
> = async (_, { entityId }, { dataSources: { graphApi }, user }) => {
  const comment = await getCommentById(
    { graphApi },
    {
      entityId,
    },
  );

  const updatedComment = await resolveComment(
    { graphApi },
    {
      comment,
      actorId: user.accountId,
    },
  );

  return mapCommentToGQL(updatedComment);
};
