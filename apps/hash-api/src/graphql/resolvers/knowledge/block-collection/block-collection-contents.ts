import type { Entity } from "@local/hash-subgraph";

import { getBlockCollectionBlocks } from "../../../../graph/knowledge/system-types/block-collection";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import type { UnresolvedBlockGQL } from "../graphql-mapping";
import { mapBlockToGQL, mapEntityToGQL } from "../graphql-mapping";

export const blockCollectionContents: ResolverFn<
  { linkEntity: Entity; rightEntity: UnresolvedBlockGQL }[],
  Entity,
  LoggedInGraphQLContext,
  {}
> = async (blockCollection, _, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const contentItems = await getBlockCollectionBlocks(context, authentication, {
    blockCollectionEntityId: blockCollection.metadata.recordId.entityId,
    blockCollectionEntityTypeId: blockCollection.metadata.entityTypeId,
  });

  return contentItems.map(({ linkEntity, rightEntity }) => ({
    linkEntity: mapEntityToGQL(linkEntity),
    rightEntity: mapBlockToGQL(rightEntity),
  }));
};
