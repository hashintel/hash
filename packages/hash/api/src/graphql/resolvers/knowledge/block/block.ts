import { BlockModel } from "../../../../model";

import { QueryPersistedBlocksArgs, ResolverFn } from "../../../apiTypes.gen";
import { GraphQLContext } from "../../../context";
import {
  UnresolvedPersistedBlockGQL,
  mapBlockModelToGQL,
} from "../model-mapping";

export const persistedBlocks: ResolverFn<
  Promise<UnresolvedPersistedBlockGQL[]>,
  {},
  GraphQLContext,
  QueryPersistedBlocksArgs
> = async (_, params, { dataSources: { graphApi } }) => {
  const blocks = await Promise.all(
    params.blocks.map(({ entityId }) =>
      BlockModel.getBlockById(graphApi, { entityId }),
    ),
  );

  return blocks.map(mapBlockModelToGQL);
};
