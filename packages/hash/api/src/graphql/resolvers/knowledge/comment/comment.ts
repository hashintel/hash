import { extractOwnedByIdFromEntityId } from "@hashintel/hash-shared/types";

import { getLatestEntityById } from "../../../../graph/knowledge/primitive/entity";
import { createComment } from "../../../../graph/knowledge/system-types/comment";
import { MutationCreateCommentArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapCommentToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const createCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreateCommentArgs
> = async (
  _,
  { parentEntityId, tokens },
  { dataSources: { graphApi }, user },
) => {
  const parent = await getLatestEntityById(
    { graphApi },
    {
      entityId: parentEntityId,
    },
  );

  const comment = await createComment(
    { graphApi },
    {
      tokens,
      ownedById: extractOwnedByIdFromEntityId(parent.metadata.editionId.baseId),
      parent,
      author: user,
      actorId: user.accountId,
    },
  );

  return mapCommentToGQL(comment);
};
