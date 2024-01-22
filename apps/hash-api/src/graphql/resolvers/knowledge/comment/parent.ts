import { Entity } from "@local/hash-subgraph";

import { getCommentParent } from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapEntityToGQL, UnresolvedCommentGQL } from "../graphql-mapping";

export const commentParentResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const parent = await getCommentParent(context, authentication, {
    commentEntityId: metadata.recordId.entityId,
  });

  return mapEntityToGQL(parent);
};
