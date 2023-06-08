import { Entity } from "@local/hash-subgraph";

import { getPageBlocks } from "../../../../graph/knowledge/system-types/page";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import {
  mapBlockToGQL,
  mapEntityToGQL,
  UnresolvedBlockGQL,
  UnresolvedPageGQL,
} from "../graphql-mapping";

export const pageContents: ResolverFn<
  Promise<{ linkEntity: Entity; rightEntity: UnresolvedBlockGQL }[]>,
  UnresolvedPageGQL,
  LoggedInGraphQLContext,
  {}
> = async (page, _, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const contentItems = await getPageBlocks(context, {
    pageEntityId: page.metadata.recordId.entityId,
  });

  return contentItems.map(({ linkEntity, rightEntity }) => ({
    linkEntity: mapEntityToGQL(linkEntity),
    rightEntity: mapBlockToGQL(rightEntity),
  }));
};
