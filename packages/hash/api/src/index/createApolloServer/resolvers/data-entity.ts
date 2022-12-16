import { Entity } from "@hashintel/hash-subgraph";
import { BlockModel } from "../../auth/model";

import {
  QueryBlocksArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { GraphQLContext } from "./embed/context";
import {
  UnresolvedBlockGQL,
  mapEntityModelToGQL,
} from "./page/update-page-contents/model-mapping";

export const blockChildEntity: ResolverFn<
  Promise<Entity>,
  UnresolvedBlockGQL,
  GraphQLContext,
  QueryBlocksArgs
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const blockModel = await BlockModel.getBlockById(graphApi, {
    entityId: metadata.editionId.baseId,
  });

  return mapEntityModelToGQL(await blockModel.getBlockData(graphApi));
};
