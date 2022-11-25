import { ApolloError } from "apollo-server-errors";
import { Entity } from "@hashintel/hash-subgraph";
import { PageModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapBlockModelToGQL, UnresolvedPageGQL } from "../model-mapping";

export const pageContents: ResolverFn<
  Promise<Entity[]>,
  UnresolvedPageGQL,
  LoggedInGraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources }) => {
  const { graphApi } = dataSources;
  const entityId = metadata.editionId.baseId;
  const page = await PageModel.getPageById(graphApi, { entityId });

  if (!page) {
    throw new ApolloError(
      `Page with entityId ${entityId} not found`,
      "NOT_FOUND",
    );
  }

  const blocks = await page.getBlocks(graphApi);

  return blocks.map((block) => mapBlockModelToGQL(block));
};
