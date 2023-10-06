import {
  getCommentById,
  updateCommentText,
} from "../../../../graph/knowledge/system-types/comment";
import {
  MutationUpdateCommentTextArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const updateCommentTextResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateCommentTextArgs
> = async (_, { entityId, tokens }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  await updateCommentText(context, authentication, {
    commentEntityId: entityId,
    tokens,
  });

  const comment = await getCommentById(context, authentication, {
    entityId,
  });

  return mapCommentToGQL(comment);
};
