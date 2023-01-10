import {
  getCommentById,
  updateCommentText,
} from "../../../../graph/knowledge/system-types/comment";
import {
  MutationUpdateCommentTextArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const updateCommentTextResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateCommentTextArgs
> = async (_, { entityId, tokens }, { dataSources, user }) => {
  const ctx = dataSourceToImpureGraphContext(dataSources);

  const comment = await getCommentById(ctx, {
    entityId,
  });

  await updateCommentText(ctx, {
    comment,
    actorId: user.accountId,
    tokens,
  });

  return mapCommentToGQL(comment);
};
