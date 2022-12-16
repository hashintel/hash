import { BlockModel } from "../../auth/model";

import {
  QueryBlocksArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { GraphQLContext } from "./embed/context";
import {
  UnresolvedBlockGQL,
  mapBlockModelToGQL,
} from "./page/update-page-contents/model-mapping";

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
