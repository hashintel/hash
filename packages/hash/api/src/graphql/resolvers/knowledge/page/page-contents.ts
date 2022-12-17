import { ApolloError } from "apollo-server-errors";
import { Entity } from "@hashintel/hash-subgraph";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapBlockToGQL, UnresolvedPageGQL } from "../graphql-mapping";
import {
  getPageBlocks,
  getPageById,
} from "../../../../graph/knowledge/system-types/page";

export const pageContents: ResolverFn<
  Promise<Entity[]>,
  UnresolvedPageGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const { graphApi } = dataSources;
  const entityId = metadata.editionId.baseId;
  const page = await getPageById({ graphApi }, { entityId });

  if (!page) {
    throw new ApolloError(
      `Page with entityId ${entityId} not found`,
      "NOT_FOUND",
    );
  }

  const blocks = await getPageBlocks({ graphApi }, { page });

  return blocks.map((block) => mapBlockToGQL(block));
};
