import { getCommentText } from "../../../../graph/knowledge/system-types/comment";
import type { CommentResolvers } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const commentTextUpdatedAtResolver: CommentResolvers<LoggedInGraphQLContext>["textUpdatedAt"] =
  async ({ metadata }, _, { dataSources, authentication }) => {
    const context = dataSourcesToImpureGraphContext(dataSources);

    const text = await getCommentText(context, authentication, {
      commentEntityId: metadata.recordId.entityId,
    });

    return text.entity.metadata.temporalVersioning;
  };
