import {
  getCommentById,
  updateCommentText,
} from "../../../../graph/knowledge/system-types/comment";
import type {
  MutationUpdateCommentTextArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedCommentGQL } from "../graphql-mapping";
import { mapCommentToGQL } from "../graphql-mapping";

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
