import { ApolloError } from "apollo-server-errors";
import { Entity } from "@hashintel/hash-subgraph";
import { PageModel } from "../../../auth/model";
import { ResolverFn } from "../../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "../embed/context";
import {
  mapBlockModelToGQL,
  UnresolvedPageGQL,
} from "./update-page-contents/model-mapping";

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
