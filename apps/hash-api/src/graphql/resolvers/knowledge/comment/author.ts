import type { Entity } from "@local/hash-subgraph";

import { getCommentAuthor } from "../../../../graph/knowledge/system-types/comment";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedCommentGQL } from "../graphql-mapping";
import { mapEntityToGQL } from "../graphql-mapping";

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
