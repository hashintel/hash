import { extractOwnedByIdFromEntityId } from "@hashintel/hash-shared/types";

import { getLatestEntityById } from "../../../../graph/knowledge/primitive/entity";
import { createComment } from "../../../../graph/knowledge/system-types/comment";
import { MutationCreateCommentArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const createCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreateCommentArgs
> = async (_, { parentEntityId, tokens }, { dataSources, user }) => {
  const ctx = dataSourceToImpureGraphContext(dataSources);

  const parent = await getLatestEntityById(ctx, {
    entityId: parentEntityId,
  });

  const comment = await createComment(ctx, {
    tokens,
    ownedById: extractOwnedByIdFromEntityId(parent.metadata.editionId.baseId),
    parent,
    author: user,
    actorId: user.accountId,
  });

  return mapCommentToGQL(comment);
};
