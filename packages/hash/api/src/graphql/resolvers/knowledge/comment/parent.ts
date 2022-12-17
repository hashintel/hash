import { Entity } from "@hashintel/hash-subgraph";
import {
  getCommentById,
  getCommentParent,
} from "../../../../graph/knowledge/system-types/comment";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedCommentGQL, mapEntityToGQL } from "../graphql-mapping";

export const commentParentResolver: ResolverFn<
  Promise<Entity>,
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
  const parent = await getCommentParent({ graphApi }, { comment });

  return mapEntityToGQL(parent);
};
