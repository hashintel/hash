import { Entity } from "@local/hash-subgraph";

import { getCommentAuthor } from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapEntityToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const commentAuthorResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const author = await getCommentAuthor(context, {
    commentEntityId: metadata.recordId.entityId,
  });

  return mapEntityToGQL(author.entity);
};
