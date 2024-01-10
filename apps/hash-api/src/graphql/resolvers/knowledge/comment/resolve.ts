import {
  getCommentById,
  resolveComment,
} from "../../../../graph/knowledge/system-types/comment";
import type {
  MutationResolveCommentArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import type { UnresolvedCommentGQL } from "../graphql-mapping";
import { mapCommentToGQL } from "../graphql-mapping";

export const resolveCommentResolver: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationResolveCommentArgs
> = async (_, { entityId }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const comment = await getCommentById(context, authentication, {
    entityId,
  });

  const updatedComment = await resolveComment(context, authentication, {
    comment,
  });

  return mapCommentToGQL(updatedComment);
};
