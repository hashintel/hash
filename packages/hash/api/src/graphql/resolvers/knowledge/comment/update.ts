import { WORKSPACE_TYPES } from "../../../../graph/workspace-types";
import { CommentModel } from "../../../../model";
import {
  MutationUpdatePersistedCommentArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedCommentGQL,
  mapCommentModelToGQL,
} from "../model-mapping";

export const updatePersistedComment: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePersistedCommentArgs
> = async (
  _,
  { entityId, updatedProperties },
  { dataSources: { graphApi }, userModel },
) => {
  const commentModel = await CommentModel.getCommentById(graphApi, {
    entityId,
  });

  const updatedCommentEntityModel = await commentModel.updateProperties(
    graphApi,
    {
      updatedProperties: Object.entries(updatedProperties).map(
        ([propertyName, value]) => ({
          propertyTypeBaseUri:
            WORKSPACE_TYPES.propertyType[
              propertyName as keyof MutationUpdatePersistedCommentArgs["updatedProperties"]
            ].baseUri,
          value,
        }),
      ),
      actorId: userModel.entityId,
    },
  );

  const updatedCommentModel = CommentModel.fromEntityModel(
    updatedCommentEntityModel,
  );

  return mapCommentModelToGQL(updatedCommentModel);
};
