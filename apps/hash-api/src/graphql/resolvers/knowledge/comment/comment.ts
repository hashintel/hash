import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import { createComment } from "../../../../graph/knowledge/system-types/comment";
import { MutationCreateCommentArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const createCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateCommentArgs
> = async (_, { parentEntityId, textualContent }, graphQLContext) => {
  const { authentication, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const comment = await createComment(context, authentication, {
    textualContent,
    ownedById: extractOwnedByIdFromEntityId(parentEntityId),
    parentEntityId,
    author: user,
  });

  return mapCommentToGQL(comment);
};
