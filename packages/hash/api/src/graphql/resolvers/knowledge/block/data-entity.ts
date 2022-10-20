import { BlockModel } from "../../../../model";

import { QueryPersistedBlocksArgs, ResolverFn } from "../../../apiTypes.gen";
import { GraphQLContext } from "../../../context";
import {
  UnresolvedPersistedBlockGQL,
  UnresolvedPersistedEntityGQL,
  mapEntityModelToGQL,
} from "../model-mapping";

export const blockChildEntity: ResolverFn<
  Promise<UnresolvedPersistedEntityGQL>,
  UnresolvedPersistedBlockGQL,
  GraphQLContext,
  QueryPersistedBlocksArgs
> = async ({ entityId }, _, { dataSources: { graphApi } }) => {
  const blockModel = await BlockModel.getBlockById(graphApi, {
    entityId,
  });

  return mapEntityModelToGQL(await blockModel.getBlockData(graphApi));
};
