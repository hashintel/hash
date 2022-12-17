import { OwnedById } from "@hashintel/hash-shared/types";
import { extractOwnedByIdFromEntityId } from "@hashintel/hash-subgraph";
import { getLatestEntityById } from "../../../../graph/knowledge/primitive/entity";
import { createComment } from "../../../../graph/knowledge/system-types/comment";
import { MutationCreateCommentArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapCommentToGQL } from "../graphql-mapping";

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
      ownedById: extractOwnedByIdFromEntityId(
        parent.metadata.editionId.baseId,
      ) as OwnedById,
      parent,
      author: user,
      actorId: user.accountId,
    },
  );

  return mapCommentToGQL(comment);
};
