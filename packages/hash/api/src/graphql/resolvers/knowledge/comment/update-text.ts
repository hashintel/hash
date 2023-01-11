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
  const context = dataSourceToImpureGraphContext(dataSources);

  const comment = await getCommentById(context, {
    entityId,
  });

  await updateCommentText(context, {
    comment,
    actorId: user.accountId,
    tokens,
  });

  return mapCommentToGQL(comment);
};
