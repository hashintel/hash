import type { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
import type { HasSpatiallyPositionedContent } from "@local/hash-isomorphic-utils/system-types/canvas";
import type { HasIndexedContent } from "@local/hash-isomorphic-utils/system-types/shared";

import { getBlockCollectionBlocks } from "../../../../graph/knowledge/system-types/block-collection.js";
import type { ResolverFn } from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type { UnresolvedBlockGQL } from "../graphql-mapping.js";
import { mapBlockToGQL } from "../graphql-mapping.js";

export const blockCollectionContents: ResolverFn<
  {
    linkEntity: LinkEntity<HasSpatiallyPositionedContent | HasIndexedContent>;
    rightEntity: UnresolvedBlockGQL;
  }[],
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
