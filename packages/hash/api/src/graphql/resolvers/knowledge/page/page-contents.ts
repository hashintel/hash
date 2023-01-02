import { Entity } from "@hashintel/hash-subgraph";
import { ApolloError } from "apollo-server-errors";

import {
  getPageBlocks,
  getPageById,
} from "../../../../graph/knowledge/system-types/page";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapBlockToGQL, UnresolvedPageGQL } from "../graphql-mapping";

export const pageContents: ResolverFn<
  Promise<Entity[]>,
  UnresolvedPageGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const { graphApi } = dataSources;
  const entityId = metadata.editionId.baseId;
  const page = await getPageById({ graphApi }, { entityId });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  if (!page) {
    throw new ApolloError(
      `Page with entityId ${entityId} not found`,
      "NOT_FOUND",
    );
  }

  const blocks = await getPageBlocks({ graphApi }, { page });

  return blocks.map((block) => mapBlockToGQL(block));
};
