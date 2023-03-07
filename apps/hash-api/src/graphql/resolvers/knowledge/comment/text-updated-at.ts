import {
  getCommentById,
  getCommentText,
} from "../../../../graph/knowledge/system-types/comment";
import { CommentResolvers } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const commentTextUpdatedAtResolver: CommentResolvers<LoggedInGraphQLContext>["textUpdatedAt"] =
  async ({ metadata }, _, { dataSources }) => {
    const context = dataSourcesToImpureGraphContext(dataSources);

    const comment = await getCommentById(context, {
      entityId: metadata.recordId.entityId,
    });
    const textEntity = await getCommentText(context, { comment });

    return textEntity.metadata.temporalVersioning;
  };
