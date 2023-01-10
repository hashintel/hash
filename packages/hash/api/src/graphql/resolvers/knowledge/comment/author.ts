import { Entity } from "@hashintel/hash-subgraph";

import {
  getCommentAuthor,
  getCommentById,
} from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";
import { mapEntityToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const commentAuthorResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const ctx = dataSourceToImpureGraphContext(dataSources);

  const comment = await getCommentById(ctx, {
    entityId: metadata.editionId.baseId,
  });
  const author = await getCommentAuthor(ctx, { comment });

  return mapEntityToGQL(author.entity);
};
