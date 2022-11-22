import { ApolloError } from "apollo-server-errors";
import { EntityWithMetadata } from "@hashintel/hash-subgraph";
import { PageModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  mapBlockModelToGQL,
  UnresolvedPersistedPageGQL,
} from "../model-mapping";

export const persistedPageContents: ResolverFn<
  Promise<EntityWithMetadata[]>,
  UnresolvedPersistedPageGQL,
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
