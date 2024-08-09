import {
  getCommentById,
  updateCommentText,
} from "../../../../graph/knowledge/system-types/comment.js";
import type {
  MutationUpdateCommentTextArgs,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type { UnresolvedCommentGQL } from "../graphql-mapping.js";
import { mapCommentToGQL } from "../graphql-mapping.js";

export const updateCommentTextResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateCommentTextArgs
> = async (_, { entityId, textualContent }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  await updateCommentText(context, authentication, {
    commentEntityId: entityId,
    textualContent,
  });

  const comment = await getCommentById(context, authentication, {
    entityId,
  });

  return mapCommentToGQL(comment);
};
