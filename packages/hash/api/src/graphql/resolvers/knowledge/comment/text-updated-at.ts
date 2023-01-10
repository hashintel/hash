import { EntityVersion } from "@hashintel/hash-subgraph";

import {
  getCommentById,
  getCommentText,
} from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";
import { UnresolvedCommentGQL } from "../graphql-mapping";

export const commentTextUpdatedAtResolver: ResolverFn<
  Promise<EntityVersion>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const ctx = dataSourceToImpureGraphContext(dataSources);

  const comment = await getCommentById(ctx, {
    entityId: metadata.editionId.baseId,
  });
  const textEntity = await getCommentText(ctx, { comment });

  return textEntity.metadata.version;
};
