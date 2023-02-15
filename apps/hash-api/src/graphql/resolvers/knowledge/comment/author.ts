import { Entity } from "@local/hash-subgraph/main";

import {
  getCommentAuthor,
  getCommentById,
} from "../../../../graph/knowledge/system-types/comment";
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

  const comment = await getCommentById(context, {
    entityId: metadata.recordId.entityId,
  });
  const author = await getCommentAuthor(context, { comment });

  return mapEntityToGQL(author.entity);
};
