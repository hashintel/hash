import { getCommentText } from "../../../../graph/knowledge/system-types/comment.js";
import type { CommentResolvers } from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";

export const commentTextUpdatedAtResolver: CommentResolvers<LoggedInGraphQLContext>["textUpdatedAt"] =
  async ({ metadata }, _, graphQLContext) => {
    const { authentication } = graphQLContext;
    const context = graphQLContextToImpureGraphContext(graphQLContext);

    const text = await getCommentText(context, authentication, {
      commentEntityId: metadata.recordId.entityId,
    });

    return text.entity.metadata.temporalVersioning;
  };
