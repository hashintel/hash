import {
  getCommentById,
  updateCommentText,
} from "../../../../graph/knowledge/system-types/comment";
import {
  MutationUpdateCommentTextArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const updateCommentTextResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateCommentTextArgs
> = async (_, { entityId, tokens }, { dataSources: { graphApi }, user }) => {
  const comment = await getCommentById(
    { graphApi },
    {
      entityId,
    },
  );

  await updateCommentText(
    { graphApi },
    {
      comment,
      actorId: user.accountId,
      tokens,
    },
  );

  return mapCommentToGQL(comment);
};
