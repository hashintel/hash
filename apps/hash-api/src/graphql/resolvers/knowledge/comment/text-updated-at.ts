import { getCommentText } from "../../../../graph/knowledge/system-types/comment";
import { CommentResolvers } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const commentTextUpdatedAtResolver: CommentResolvers<LoggedInGraphQLContext>["textUpdatedAt"] =
  async ({ metadata }, _, { dataSources, user }) => {
    const context = dataSourcesToImpureGraphContext(dataSources);
    const authentication = { actorId: user.accountId };

    const textEntity = await getCommentText(context, authentication, {
      commentEntityId: metadata.recordId.entityId,
    });

    return textEntity.metadata.temporalVersioning;
  };
