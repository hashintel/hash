import { Entity } from "@local/hash-subgraph";

import { getCommentAuthor } from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { mapEntityToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const commentAuthorResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const author = await getCommentAuthor(context, authentication, {
    commentEntityId: metadata.recordId.entityId,
  });

  return mapEntityToGQL(author.entity);
};
