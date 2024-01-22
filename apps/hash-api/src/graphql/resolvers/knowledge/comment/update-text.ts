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
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateCommentTextArgs
> = async (
  _,
  { entityId, textualContent },
  { dataSources, authentication },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  await updateCommentText(context, authentication, {
    commentEntityId: entityId,
    textualContent,
  });

  const comment = await getCommentById(context, authentication, {
    entityId,
  });

  return mapCommentToGQL(comment);
};
