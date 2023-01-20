import { Entity } from "@local/hash-subgraph/src";
import { ApolloError } from "apollo-server-errors";

import {
  getPageBlocks,
  getPageById,
} from "../../../../graph/knowledge/system-types/page";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapBlockToGQL, UnresolvedPageGQL } from "../graphql-mapping";

export const pageContents: ResolverFn<
  Promise<Entity[]>,
  UnresolvedPageGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const entityId = metadata.editionId.baseId;
  const page = await getPageById(context, { entityId });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  if (!page) {
    throw new ApolloError(
      `Page with entityId ${entityId} not found`,
      "NOT_FOUND",
    );
  }

  const blocks = await getPageBlocks(context, { page });

  return blocks.map((block) => mapBlockToGQL(block));
};
