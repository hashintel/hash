import { CommentModel } from "../../auth/model";
import {
  MutationResolveCommentArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";
import {
  UnresolvedCommentGQL,
  mapCommentModelToGQL,
} from "./page/update-page-contents/model-mapping";

export const resolveComment: ResolverFn<
  Promise<UnresolvedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationResolveCommentArgs
> = async (_, { entityId }, { dataSources: { graphApi }, userModel }) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });

  const updatedCommentModel = await commentModel.resolve(graphApi, {
    actorId: userModel.getEntityUuid(),
  });

  return mapCommentModelToGQL(updatedCommentModel);
};
