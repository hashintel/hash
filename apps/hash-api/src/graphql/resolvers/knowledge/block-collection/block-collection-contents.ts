import { Entity } from "@local/hash-subgraph";

import { getBlockCollectionBlocks } from "../../../../graph/knowledge/system-types/block-collection";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import {
  mapBlockToGQL,
  mapEntityToGQL,
  UnresolvedBlockGQL,
} from "../graphql-mapping";

export const blockCollectionContents: ResolverFn<
  { linkEntity: Entity; rightEntity: UnresolvedBlockGQL }[],
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
    linkEntity: mapEntityToGQL(linkEntity),
    rightEntity: mapBlockToGQL(rightEntity),
  }));
};
