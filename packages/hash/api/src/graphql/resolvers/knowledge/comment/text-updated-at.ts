import { EntityVersion } from "@hashintel/hash-subgraph";

import {
  getCommentById,
  getCommentText,
} from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL } from "../graphql-mapping";

export const commentTextUpdatedAtResolver: ResolverFn<
  Promise<EntityVersion>,
  UnresolvedCommentGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const comment = await getCommentById(
    { graphApi },
    {
      entityId: metadata.editionId.baseId,
    },
  );
  const textEntity = await getCommentText({ graphApi }, { comment });

  return textEntity.metadata.version;
};
