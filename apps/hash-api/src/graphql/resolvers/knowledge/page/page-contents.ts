import type { Entity } from "@local/hash-graph-sdk/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { HasSpatiallyPositionedContent } from "@local/hash-isomorphic-utils/system-types/canvas";
import type { HasIndexedContent } from "@local/hash-isomorphic-utils/system-types/shared";

import { getPageBlocks } from "../../../../graph/knowledge/system-types/page";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type {
  mapBlockToGQL,
  UnresolvedBlockGQL,
  UnresolvedPageGQL,
} from "../graphql-mapping";

export const pageContents: ResolverFn<
  {
    linkEntity: Entity<HasIndexedContent | HasSpatiallyPositionedContent>;
    rightEntity: UnresolvedBlockGQL;
  }[],
  UnresolvedPageGQL,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (page, _, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const contentItems = await getPageBlocks(context, authentication, {
    pageEntityId: page.metadata.recordId.entityId,
    type:
      page.metadata.entityTypeId === systemEntityTypes.canvas.entityTypeId
        ? "canvas"
        : "document",
  });

  return contentItems.map(({ linkEntity, rightEntity }) => ({
    linkEntity,
    rightEntity: mapBlockToGQL(rightEntity),
  }));
};
