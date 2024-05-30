import type { SimpleEntity } from "@local/hash-graph-types/entity";

import { getCommentParent } from "../../../../graph/knowledge/system-types/comment";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedCommentGQL } from "../graphql-mapping";
import { mapEntityToGQL } from "../graphql-mapping";

export const commentParentResolver: ResolverFn<
  Promise<SimpleEntity>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const parent = await getCommentParent(context, authentication, {
    commentEntityId: metadata.recordId.entityId,
  });

  return mapEntityToGQL(parent);
};
