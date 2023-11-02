import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import { createComment } from "../../../../graph/knowledge/system-types/comment";
import { MutationCreateCommentArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const createCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreateCommentArgs
> = async (
  _,
  { parentEntityId, textualContent },
  { dataSources, authentication, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const comment = await createComment(context, authentication, {
    textualContent,
    ownedById: extractOwnedByIdFromEntityId(parentEntityId),
    parentEntityId,
    author: user,
  });

  return mapCommentToGQL(comment);
};
