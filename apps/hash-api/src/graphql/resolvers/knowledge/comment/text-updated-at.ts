import { getCommentText } from "../../../../graph/knowledge/system-types/comment";
import { CommentResolvers } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const commentTextUpdatedAtResolver: CommentResolvers<LoggedInGraphQLContext>["textUpdatedAt"] =
  async ({ metadata }, _, graphQLContext) => {
    const { authentication } = graphQLContext;
    const context = graphQLContextToImpureGraphContext(graphQLContext);

    const text = await getCommentText(context, authentication, {
      commentEntityId: metadata.recordId.entityId,
    });

    return text.entity.metadata.temporalVersioning;
  };
