import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Entity } from "@local/hash-subgraph";

import { getPageBlocks } from "../../../../graph/knowledge/system-types/page";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import type { UnresolvedBlockGQL, UnresolvedPageGQL } from "../graphql-mapping";
import { mapBlockToGQL, mapEntityToGQL } from "../graphql-mapping";

export const pageContents: ResolverFn<
  { linkEntity: Entity; rightEntity: UnresolvedBlockGQL }[],
  UnresolvedPageGQL,
  LoggedInGraphQLContext,
  {}
> = async (page, _, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const contentItems = await getPageBlocks(context, authentication, {
    pageEntityId: page.metadata.recordId.entityId,
    type:
      page.metadata.entityTypeId === systemEntityTypes.canvas.entityTypeId
        ? "canvas"
        : "document",
  });

  return contentItems.map(({ linkEntity, rightEntity }) => ({
    linkEntity: mapEntityToGQL(linkEntity),
    rightEntity: mapBlockToGQL(rightEntity),
  }));
};
