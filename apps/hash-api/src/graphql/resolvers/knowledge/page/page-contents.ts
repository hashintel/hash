import type { Entity } from "@local/hash-graph-sdk/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { HasSpatiallyPositionedContent } from "@local/hash-isomorphic-utils/system-types/canvas";
import type { HasIndexedContent } from "@local/hash-isomorphic-utils/system-types/shared";

import { getPageBlocks } from "../../../../graph/knowledge/system-types/page.js";
import type { ResolverFn } from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type {
  UnresolvedBlockGQL,
  UnresolvedPageGQL,
} from "../graphql-mapping.js";
import { mapBlockToGQL } from "../graphql-mapping.js";

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
