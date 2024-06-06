import type { Entity } from "@local/hash-graph-sdk/entity";
import type { HasData } from "@local/hash-isomorphic-utils/system-types/shared";

import { getBlockCollectionBlocks } from "../../../../graph/knowledge/system-types/block-collection";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedBlockGQL } from "../graphql-mapping";
import { mapBlockToGQL } from "../graphql-mapping";

export const blockCollectionContents: ResolverFn<
  { linkEntity: HasData; rightEntity: UnresolvedBlockGQL }[],
  Entity,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (blockCollection, _, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const contentItems = await getBlockCollectionBlocks(
    context,
    graphQLContext.authentication,
    {
      blockCollectionEntityId: blockCollection.metadata.recordId.entityId,
      blockCollectionEntityTypeId: blockCollection.metadata.entityTypeId,
    },
  );

  return contentItems.map(({ linkEntity, rightEntity }) => ({
    linkEntity,
    rightEntity: mapBlockToGQL(rightEntity),
  }));
};
