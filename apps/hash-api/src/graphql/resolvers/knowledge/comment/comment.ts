import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import { createComment } from "../../../../graph/knowledge/system-types/comment.js";
import type {
  MutationCreateCommentArgs,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type { UnresolvedCommentGQL } from "../graphql-mapping.js";
import { mapCommentToGQL } from "../graphql-mapping.js";

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
