import { Entity } from "@hashintel/hash-subgraph";

import {
  getCommentById,
  getCommentParent,
} from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";
import { mapEntityToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const commentParentResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const context = dataSourceToImpureGraphContext(dataSources);

  const comment = await getCommentById(context, {
    entityId: metadata.editionId.baseId,
  });
  const parent = await getCommentParent(context, { comment });

  return mapEntityToGQL(parent);
};
