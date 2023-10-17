import { Entity } from "@local/hash-subgraph";

import { getBlockCollectionBlocks } from "../../../../graph/knowledge/system-types/block-collection";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import {
  mapBlockToGQL,
  mapEntityToGQL,
  UnresolvedBlockGQL,
} from "../graphql-mapping";

export const blockCollectionContents: ResolverFn<
  { linkEntity: Entity; rightEntity: UnresolvedBlockGQL }[],
  Entity,
  LoggedInGraphQLContext,
  {}
> = async (blockCollection, _, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const contentItems = await getBlockCollectionBlocks(context, authentication, {
    blockCollectionEntityId: blockCollection.metadata.recordId.entityId,
  });

  return contentItems.map(({ linkEntity, rightEntity }) => ({
    linkEntity: mapEntityToGQL(linkEntity),
    rightEntity: mapBlockToGQL(rightEntity),
  }));
};
