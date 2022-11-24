import { EntityWithMetadata } from "@hashintel/hash-subgraph";
import { BlockModel } from "../../../../model";

import { QueryBlocksArgs, ResolverFn } from "../../../apiTypes.gen";
import { GraphQLContext } from "../../../context";
import { UnresolvedBlockGQL, mapEntityModelToGQL } from "../model-mapping";

export const blockChildEntity: ResolverFn<
  Promise<EntityWithMetadata>,
  UnresolvedBlockGQL,
  GraphQLContext,
  QueryBlocksArgs
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const blockModel = await BlockModel.getBlockById(graphApi, {
    entityId: metadata.editionId.baseId,
  });

  return mapEntityModelToGQL(await blockModel.getBlockData(graphApi));
};
