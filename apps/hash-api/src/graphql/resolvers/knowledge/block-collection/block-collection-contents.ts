import type { SimpleEntity } from "@local/hash-graph-types/entity";

import { getBlockCollectionBlocks } from "../../../../graph/knowledge/system-types/block-collection";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedBlockGQL } from "../graphql-mapping";
import { mapBlockToGQL, mapEntityToGQL } from "../graphql-mapping";

export const blockCollectionContents: ResolverFn<
  { linkEntity: SimpleEntity; rightEntity: UnresolvedBlockGQL }[],
  SimpleEntity,
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
