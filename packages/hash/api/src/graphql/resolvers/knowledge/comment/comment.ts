import { extractOwnedByIdFromEntityId } from "@local/hash-shared/types";

import { getLatestEntityById } from "../../../../graph/knowledge/primitive/entity";
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
> = async (_, { parentEntityId, tokens }, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const parent = await getLatestEntityById(context, {
    entityId: parentEntityId,
  });

  const comment = await createComment(context, {
    tokens,
    ownedById: extractOwnedByIdFromEntityId(parent.metadata.editionId.baseId),
    parent,
    author: user,
    actorId: user.accountId,
  });

  return mapCommentToGQL(comment);
};
