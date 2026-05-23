import { extractWebIdFromEntityId } from "@blockprotocol/type-system";

import { createComment } from "../../../../graph/knowledge/system-types/comment";
import { graphQLContextToImpureGraphContext } from "../../util";
import { mapCommentToGQL } from "../graphql-mapping";

import type { MutationCreateCommentArgs, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import type { UnresolvedCommentGQL } from "../graphql-mapping";

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
    webId: extractWebIdFromEntityId(parentEntityId),
    parentEntityId,
    author: user,
  });

  return mapCommentToGQL(comment);
};
