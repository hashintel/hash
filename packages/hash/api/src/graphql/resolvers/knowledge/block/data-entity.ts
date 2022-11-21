import { BlockModel } from "../../../../model";

import {
  EntityWithMetadata,
  QueryPersistedBlocksArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { GraphQLContext } from "../../../context";
import {
  UnresolvedPersistedBlockGQL,
  mapEntityModelToGQL,
} from "../model-mapping";

export const blockChildEntity: ResolverFn<
  Promise<EntityWithMetadata>,
  UnresolvedPersistedBlockGQL,
  GraphQLContext,
  QueryPersistedBlocksArgs
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const blockModel = await BlockModel.getBlockById(graphApi, {
    entityId: metadata.editionId.baseId,
  });

  return mapEntityModelToGQL(await blockModel.getBlockData(graphApi));
};
