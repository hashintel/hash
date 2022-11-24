import { BlockModel } from "../../../../model";

import { QueryBlocksArgs, ResolverFn } from "../../../apiTypes.gen";
import { GraphQLContext } from "../../../context";
import { UnresolvedBlockGQL, mapBlockModelToGQL } from "../model-mapping";

export const blocks: ResolverFn<
  Promise<UnresolvedBlockGQL[]>,
  {},
  GraphQLContext,
  QueryBlocksArgs
> = async (_, params, { dataSources: { graphApi } }) => {
  const blocksPromise = await Promise.all(
    params.blocks.map((entityId) =>
      BlockModel.getBlockById(graphApi, { entityId }),
    ),
  );

  return blocksPromise.map(mapBlockModelToGQL);
};
